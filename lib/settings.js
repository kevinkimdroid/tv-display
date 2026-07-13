const fs = require('fs');
const path = require('path');
const { getDashboard, clearCache } = require('./revenue');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { revenue: { enabled: true, year: String(new Date().getFullYear()), slideDuration: 14, slides: ['ytd', 'monthly', 'accounts'] } };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function registerRevenueRoutes(app) {
  app.get('/api/settings', (req, res) => {
    res.json(readSettings());
  });

  app.put('/api/settings', (req, res) => {
    const current = readSettings();
    const updated = { ...current, ...req.body };
    if (req.body.revenue) {
      updated.revenue = { ...current.revenue, ...req.body.revenue };
    }
    writeSettings(updated);
    res.json(updated);
  });

  app.get('/api/revenue/dashboard', async (req, res) => {
    try {
      const settings = readSettings();
      const year = req.query.year || settings.revenue?.year || String(new Date().getFullYear());
      const data = await getDashboard(year);
      res.json(data);
    } catch (err) {
      console.error('Revenue dashboard error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to fetch revenue data' });
    }
  });

  app.post('/api/revenue/refresh', async (req, res) => {
    try {
      clearCache();
      const settings = readSettings();
      const year = settings.revenue?.year || String(new Date().getFullYear());
      const data = await getDashboard(year);
      res.json(data);
    } catch (err) {
      console.error('Revenue refresh error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to refresh revenue data' });
    }
  });
}

module.exports = { readSettings, registerRevenueRoutes };
