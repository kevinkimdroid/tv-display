const stage = document.getElementById('stage');
const emptyMsg = document.getElementById('empty');
const clockEl = document.getElementById('clock');
const counterEl = document.getElementById('counter');
const hudEl = document.getElementById('hud');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const fullscreenHint = document.getElementById('fullscreen-hint');

let playlist = [];
let settings = { revenue: { enabled: false } };
let revenueData = null;
let currentIndex = 0;
let currentEl = null;
let advanceTimer = null;
let progressInterval = null;
let progressStart = 0;
let progressDuration = 0;

const fmt = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const fmtShort = new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 });

function formatMoney(n) { return fmt.format(n); }
function formatShort(n) { return fmtShort.format(n); }

// --- Clock ---------------------------------------------------------------

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
setInterval(tickClock, 1000);
tickClock();

// --- Progress bar --------------------------------------------------------

function startProgress(seconds) {
  clearInterval(progressInterval);
  progressStart = Date.now();
  progressDuration = seconds * 1000;
  progressBar.style.width = '0%';
  progressWrap.classList.add('visible');

  progressInterval = setInterval(() => {
    const elapsed = Date.now() - progressStart;
    const pct = Math.min((elapsed / progressDuration) * 100, 100);
    progressBar.style.width = pct + '%';
    if (pct >= 100) clearInterval(progressInterval);
  }, 50);
}

function stopProgress() {
  clearInterval(progressInterval);
  progressWrap.classList.remove('visible');
  progressBar.style.width = '0%';
}

// --- Build full slide list (revenue + media) -----------------------------

function buildSlideList() {
  const slides = [];
  const rev = settings.revenue;

  if (rev?.enabled && revenueData) {
    const types = rev.slides || ['ytd', 'monthly', 'accounts'];
    const duration = rev.slideDuration || 14;
    types.forEach((type) => {
      slides.push({ type: 'dashboard', dashboardType: type, duration });
    });
  }

  playlist.forEach((item) => slides.push(item));
  return slides;
}

let slideList = [];

function rebuildSlides() {
  const prevType = slideList[currentIndex]?.type;
  const prevDash = slideList[currentIndex]?.dashboardType;
  slideList = buildSlideList();

  if (slideList.length === 0) {
    emptyMsg.style.display = 'flex';
    hudEl.classList.remove('visible');
    return false;
  }

  emptyMsg.style.display = 'none';
  hudEl.classList.add('visible');

  if (prevType) {
    const idx = slideList.findIndex((s) =>
      s.type === prevType && (s.dashboardType == null || s.dashboardType === prevDash)
    );
    currentIndex = idx >= 0 ? idx : Math.min(currentIndex, slideList.length - 1);
  } else if (currentIndex >= slideList.length) {
    currentIndex = 0;
  }
  return true;
}

// --- Data fetching -------------------------------------------------------

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    settings = await res.json();
  } catch (err) {
    console.error('Failed to fetch settings', err);
  }
}

async function fetchRevenue() {
  try {
    const res = await fetch('/api/revenue/dashboard', { cache: 'no-store' });
    if (!res.ok) throw new Error('Revenue fetch failed');
    revenueData = await res.json();
  } catch (err) {
    console.error('Failed to fetch revenue', err);
    revenueData = null;
  }
}

async function fetchPlaylist() {
  try {
    const res = await fetch('/api/playlist', { cache: 'no-store' });
    playlist = await res.json();
  } catch (err) {
    console.error('Failed to fetch playlist', err);
  }
}

async function refreshAll() {
  await fetchSettings();
  await Promise.all([fetchRevenue(), fetchPlaylist()]);
  const hadSlides = slideList.length > 0;
  const ok = rebuildSlides();
  if (ok && !hadSlides) { currentIndex = 0; showCurrent(); }
  else if (ok && !currentEl) { currentIndex = 0; showCurrent(); }
  else if (ok && currentEl?.classList?.contains('rev-slide')) showCurrent();
  else updateCounter();
}

setInterval(refreshAll, 5 * 60 * 1000);
setInterval(fetchPlaylist, 10000);

function updateCounter() {
  if (slideList.length === 0) { counterEl.textContent = ''; return; }
  counterEl.textContent = `${currentIndex + 1} / ${slideList.length}`;
}

// --- Revenue slide builders ----------------------------------------------

function buildYtdSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide';
  const maxAmt = data.topAccounts[0]?.amount || 1;

  el.innerHTML = `
    <div class="rev-header">
      <div>
        <div class="rev-title">Premium Revenue Overview</div>
        <div class="rev-subtitle">Year-to-date performance across all accounts</div>
      </div>
      <div class="rev-year-badge">${data.year}</div>
    </div>
    <div class="rev-ytd-hero">
      <div class="rev-ytd-label">Total YTD Revenue</div>
      <div class="rev-ytd-amount">${formatMoney(data.ytdTotal)}</div>
      <div class="rev-ytd-meta">${data.accountCount} accounts · ${data.monthCount} months of data</div>
    </div>
    <div class="rev-bars">
      ${data.topAccounts.map((a) => `
        <div class="rev-bar-row">
          <div class="rev-bar-name" title="${a.name}">${a.name}</div>
          <div class="rev-bar-track"><div class="rev-bar-fill" data-pct="${(a.amount / maxAmt * 100).toFixed(1)}"></div></div>
          <div class="rev-bar-amount">${formatShort(a.amount)}</div>
        </div>
      `).join('')}
    </div>`;

  requestAnimationFrame(() => {
    el.querySelectorAll('.rev-bar-fill').forEach((bar) => {
      bar.style.width = bar.dataset.pct + '%';
    });
  });
  return el;
}

function buildMonthlySlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide';
  const maxAmt = Math.max(...data.monthly.map((m) => m.amount), 1);

  el.innerHTML = `
    <div class="rev-header">
      <div>
        <div class="rev-title">Monthly Revenue Trend</div>
        <div class="rev-subtitle">Month-over-month growth by period</div>
      </div>
      <div class="rev-year-badge">${data.year}</div>
    </div>
    <div class="rev-monthly-grid">
      ${data.monthly.map((m) => {
        const growthHtml = m.growth == null
          ? '<span class="rev-growth neutral">—</span>'
          : `<span class="rev-growth ${m.growth >= 0 ? 'up' : 'down'}">${m.growth >= 0 ? '▲' : '▼'} ${Math.abs(m.growth)}%</span>`;
        return `
          <div class="rev-month-card">
            <div class="rev-month-label">${m.shortLabel}</div>
            <div class="rev-month-bar-wrap">
              <div class="rev-month-bar" data-pct="${(m.amount / maxAmt * 100).toFixed(1)}"></div>
            </div>
            <div class="rev-month-amount">${formatShort(m.amount)}</div>
            ${growthHtml}
          </div>`;
      }).join('')}
    </div>`;

  requestAnimationFrame(() => {
    el.querySelectorAll('.rev-month-bar').forEach((bar) => {
      bar.style.height = bar.dataset.pct + '%';
    });
  });
  return el;
}

function buildAccountsSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide';

  el.innerHTML = `
    <div class="rev-header">
      <div>
        <div class="rev-title">Account Breakdown</div>
        <div class="rev-subtitle">All premium accounts · ${data.year}</div>
      </div>
      <div class="rev-year-badge">${formatShort(data.ytdTotal)}</div>
    </div>
    <div class="rev-accounts-grid">
      ${data.accounts.map((a) => `
        <div class="rev-account-card">
          <div class="rev-account-code">${a.code}</div>
          <div class="rev-account-info">
            <div class="rev-account-name" title="${a.name}">${a.name}</div>
          </div>
          <div class="rev-account-amount">${formatShort(a.amount)}</div>
        </div>
      `).join('')}
    </div>`;
  return el;
}

function buildDashboardEl(type) {
  if (!revenueData) {
    const el = document.createElement('div');
    el.className = 'rev-slide';
    el.innerHTML = '<div class="rev-loading">Loading revenue data...</div>';
    return el;
  }
  if (type === 'ytd') return buildYtdSlide(revenueData);
  if (type === 'monthly') return buildMonthlySlide(revenueData);
  if (type === 'accounts') return buildAccountsSlide(revenueData);
  return buildYtdSlide(revenueData);
}

// --- Display cycle -------------------------------------------------------

function showCurrent() {
  if (slideList.length === 0) return;
  clearTimeout(advanceTimer);
  stopProgress();
  updateCounter();

  const item = slideList[currentIndex];
  const prevEl = currentEl;
  let el;

  if (item.type === 'dashboard') {
    el = buildDashboardEl(item.dashboardType);
  } else if (item.type === 'image') {
    el = document.createElement('img');
    el.src = `/uploads/${item.filename}`;
    el.onerror = advance;
  } else {
    el = document.createElement('video');
    el.src = `/uploads/${item.filename}`;
    el.autoplay = true;
    el.muted = false;
    el.controls = false;
    el.onended = advance;
    el.onerror = advance;
  }

  stage.appendChild(el);
  void el.offsetWidth;
  el.classList.add('active');
  currentEl = el;

  if (prevEl) {
    prevEl.classList.remove('active');
    setTimeout(() => prevEl.remove(), 1000);
  }

  const seconds = item.duration && item.duration > 0 ? item.duration : (item.type === 'video' ? null : 8);
  if (seconds) {
    startProgress(seconds);
    advanceTimer = setTimeout(advance, seconds * 1000);
  }
}

function advance() {
  if (slideList.length === 0) return;
  currentIndex = (currentIndex + 1) % slideList.length;
  showCurrent();
}

// --- Init ----------------------------------------------------------------

refreshAll();

document.addEventListener('click', () => {
  fullscreenHint.classList.add('hidden');
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

setTimeout(() => fullscreenHint.classList.add('hidden'), 8000);
