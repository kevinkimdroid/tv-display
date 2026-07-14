const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const playlistEl = document.getElementById('playlist');
const emptyState = document.getElementById('emptyState');
const toast = document.getElementById('toast');
const statTotal = document.getElementById('statTotal');
const statPhotos = document.getElementById('statPhotos');
const statVideos = document.getElementById('statVideos');

let playlist = [];
let toastTimer = null;

// --- Toast ---------------------------------------------------------------

function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = type;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// --- Load & render -------------------------------------------------------

async function loadPlaylist() {
  const res = await fetch('/api/playlist');
  playlist = await res.json();
  render();
}

function updateStats() {
  const photos = playlist.filter((i) => i.type === 'image').length;
  const videos = playlist.filter((i) => i.type === 'video').length;
  statTotal.textContent = playlist.length;
  statPhotos.textContent = photos;
  statVideos.textContent = videos;
}

function render() {
  playlistEl.innerHTML = '';
  emptyState.style.display = playlist.length === 0 ? 'block' : 'none';
  updateStats();

  playlist.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'item';

    const badgeClass = item.type === 'image' ? 'photo' : 'video';
    const badgeLabel = item.type === 'image' ? 'Photo' : 'Video';

    const thumb = item.type === 'image'
      ? `<img class="thumb" src="/uploads/${item.filename}" alt="" />`
      : `<video class="thumb" src="/uploads/${item.filename}" muted></video>`;

    li.innerHTML = `
      <div class="thumb-wrap">
        ${thumb}
        <span class="type-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="info">
        <div class="name">${escapeHtml(item.originalName)}</div>
        <div class="meta">Position ${index + 1} in playlist</div>
      </div>
      ${item.type === 'image' ? `
        <label class="duration-row">
          Show
          <input type="number" min="1" class="duration-input" value="${item.duration || 8}" data-id="${item.id}" />
          sec
        </label>
      ` : ''}
      <div class="order-controls">
        <button data-action="up" data-id="${item.id}" ${index === 0 ? 'disabled' : ''} title="Move up">▲</button>
        <button data-action="down" data-id="${item.id}" ${index === playlist.length - 1 ? 'disabled' : ''} title="Move down">▼</button>
      </div>
      <button class="danger" data-action="delete" data-id="${item.id}">Remove</button>
    `;

    playlistEl.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Upload --------------------------------------------------------------

async function uploadFiles(files) {
  if (!files || files.length === 0) return;
  const formData = new FormData();
  [...files].forEach((f) => formData.append('media', f));

  dropzone.style.pointerEvents = 'none';
  dropzone.style.opacity = '0.6';
  showToast(`Uploading ${files.length} file(s)...`);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }
    playlist = await res.json();
    render();
    showToast(`${files.length} file(s) uploaded successfully`);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    dropzone.style.pointerEvents = '';
    dropzone.style.opacity = '';
    fileInput.value = '';
  }
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => uploadFiles(e.target.files));

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
  })
);
dropzone.addEventListener('drop', (e) => {
  uploadFiles(e.dataTransfer.files);
});

// --- Playlist actions ----------------------------------------------------

playlistEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'delete') {
    if (!confirm('Remove this item from the playlist?')) return;
    const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
    playlist = await res.json();
    render();
    showToast('Item removed');
  }

  if (action === 'up' || action === 'down') {
    const index = playlist.findIndex((i) => i.id === id);
    const swapWith = action === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= playlist.length) return;
    [playlist[index], playlist[swapWith]] = [playlist[swapWith], playlist[index]];
    render();
    await fetch('/api/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: playlist.map((i) => i.id) })
    });
  }
});

playlistEl.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('duration-input')) return;
  const id = e.target.dataset.id;
  const duration = parseInt(e.target.value, 10);
  if (!duration || duration <= 0) return;
  await fetch(`/api/media/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration })
  });
  showToast('Duration updated');
});

// --- Revenue settings ----------------------------------------------------

const revEnabled = document.getElementById('revEnabled');
const revYear = document.getElementById('revYear');
const revDuration = document.getElementById('revDuration');
const slidePortfolio = document.getElementById('slidePortfolio');
const slideYtd = document.getElementById('slideYtd');
const slideBudget = document.getElementById('slideBudget');
const slideMonthly = document.getElementById('slideMonthly');
const slideAccounts = document.getElementById('slideAccounts');
const saveRevenue = document.getElementById('saveRevenue');
const refreshRevenue = document.getElementById('refreshRevenue');
const revenuePreview = document.getElementById('revenuePreview');

function getSelectedSlides() {
  const slides = [];
  if (slidePortfolio.checked) slides.push('portfolio');
  if (slideYtd.checked) slides.push('ytd');
  if (slideBudget.checked) slides.push('budget');
  if (slideMonthly.checked) slides.push('monthly');
  if (slideAccounts.checked) slides.push('accounts');
  return slides;
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const settings = await res.json();
  const rev = settings.revenue || {};
  revEnabled.checked = rev.enabled !== false;
  revYear.value = rev.year || '2026';
  revDuration.value = rev.slideDuration || 14;
  const slides = rev.slides || ['portfolio', 'ytd', 'budget', 'monthly', 'accounts'];
  slidePortfolio.checked = slides.includes('portfolio');
  slideYtd.checked = slides.includes('ytd');
  slideBudget.checked = slides.includes('budget');
  slideMonthly.checked = slides.includes('monthly');
  slideAccounts.checked = slides.includes('accounts');
}

async function loadRevenuePreview() {
  revenuePreview.textContent = 'Loading preview...';
  try {
    const res = await fetch(`/api/revenue/dashboard?year=${revYear.value}`);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    const fmt = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
    const months = data.monthly.map((m) => {
      const growth = m.growth != null ? ` (${m.growth >= 0 ? '+' : ''}${m.growth}%)` : '';
      return `${m.shortLabel}: ${fmt.format(m.amount)}${growth}`;
    }).join(' · ');
    revenuePreview.innerHTML = `
      <strong>YTD Total:</strong> ${fmt.format(data.ytdTotal)}<br/>
      <strong>Months:</strong> ${months || 'No data yet'}
      ${data.budget?.summary ? `<br/><strong>Budget (${data.budget.throughLabel}):</strong> ${data.budget.summary.pctOfBudget}% · ${data.budget.summary.failingCount} behind · ${data.budget.summary.atRiskCount} at risk` : ''}`;
  } catch (err) {
    revenuePreview.textContent = `Could not load preview: ${err.message}`;
  }
}

saveRevenue.addEventListener('click', async () => {
  const slides = getSelectedSlides();
  if (slides.length === 0) {
    showToast('Select at least one slide', 'error');
    return;
  }
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revenue: {
        enabled: revEnabled.checked,
        year: revYear.value,
        slideDuration: parseInt(revDuration.value, 10) || 14,
        slides
      }
    })
  });
  showToast('Revenue settings saved');
  loadRevenuePreview();
});

refreshRevenue.addEventListener('click', async () => {
  showToast('Refreshing from Oracle...');
  try {
    const res = await fetch('/api/revenue/refresh', { method: 'POST' });
    if (!res.ok) throw new Error('Refresh failed');
    showToast('Data refreshed from Oracle');
    loadRevenuePreview();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
});

loadPlaylist();
loadSettings().then(loadRevenuePreview);
