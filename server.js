require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { registerRevenueRoutes } = require('./lib/settings');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');

// --- Ensure required directories exist (important on fresh server deploy) ---

function ensureDirs() {
  [UPLOADS_DIR, DATA_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  if (!fs.existsSync(PLAYLIST_FILE)) {
    fs.writeFileSync(PLAYLIST_FILE, '[]');
  }
}
ensureDirs();

// --- Helpers -----------------------------------------------------------

function readPlaylist() {
  try {
    const raw = fs.readFileSync(PLAYLIST_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

function writePlaylist(playlist) {
  fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(playlist, null, 2));
}

function getType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return null;
}

// --- Multer (file upload) config ---------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
  fileFilter: (req, file, cb) => {
    const type = getType(file.mimetype);
    if (!type) return cb(new Error('Only image and video files are allowed'));
    cb(null, true);
  }
});

// --- Middleware ----------------------------------------------------------

app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// --- API routes ----------------------------------------------------------

registerRevenueRoutes(app);

// Get current playlist
app.get('/api/playlist', (req, res) => {
  res.json(readPlaylist());
});

// Upload one or more media files
app.post('/api/upload', upload.array('media', 20), (req, res) => {
  const playlist = readPlaylist();

  const newItems = (req.files || []).map((file) => {
    const type = getType(file.mimetype);
    return {
      id: path.parse(file.filename).name,
      filename: file.filename,
      originalName: file.originalname,
      type,
      duration: type === 'image' ? 8 : null // seconds, only used for images
    };
  });

  const updated = [...playlist, ...newItems];
  writePlaylist(updated);
  res.json(updated);
});

// Update an item (currently: duration for images)
app.put('/api/media/:id', (req, res) => {
  const playlist = readPlaylist();
  const item = playlist.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (typeof req.body.duration === 'number' && req.body.duration > 0) {
    item.duration = req.body.duration;
  }

  writePlaylist(playlist);
  res.json(playlist);
});

// Delete an item
app.delete('/api/media/:id', (req, res) => {
  const playlist = readPlaylist();
  const item = playlist.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(UPLOADS_DIR, item.filename);
  fs.unlink(filePath, () => {}); // best effort, ignore errors

  const updated = playlist.filter((i) => i.id !== req.params.id);
  writePlaylist(updated);
  res.json(updated);
});

// Reorder the playlist - body: { order: [id1, id2, ...] }
app.post('/api/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });

  const playlist = readPlaylist();
  const byId = Object.fromEntries(playlist.map((i) => [i.id, i]));
  const reordered = order.map((id) => byId[id]).filter(Boolean);

  // append anything missing from the order array (safety net)
  playlist.forEach((item) => {
    if (!reordered.find((i) => i.id === item.id)) reordered.push(item);
  });

  writePlaylist(reordered);
  res.json(reordered);
});

// Error handler (e.g. multer file type / size errors)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Upload failed' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nTV Display server running!`);
  console.log(`  Display (open on TV):  http://localhost:${PORT}/`);
  console.log(`  Admin panel:           http://localhost:${PORT}/admin.html`);
  console.log(`  Uploads folder:        ${UPLOADS_DIR}`);
  console.log(`  Listening on:          0.0.0.0:${PORT} (all network interfaces)\n`);
});
