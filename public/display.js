const stage = document.getElementById('stage');
const emptyMsg = document.getElementById('empty');
const clockEl = document.getElementById('clock');
const counterEl = document.getElementById('counter');
const slideLabelEl = document.getElementById('slide-label');
const dotsEl = document.getElementById('dots');
const footerEl = document.getElementById('footer');
const tickerWrap = document.getElementById('ticker-wrap');
const tickerTrack = document.getElementById('ticker-track');
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

const SLIDE_LABELS = {
  ytd: 'YTD PREMIUM SUMMARY',
  monthly: 'MONTHLY PREMIUM TREND',
  accounts: 'ACCOUNT BREAKDOWN',
  image: 'MEDIA',
  video: 'MEDIA'
};

function formatMoney(n) { return fmt.format(n); }
function formatShort(n) { return fmtShort.format(n); }

// --- Animated count-up ---------------------------------------------------

function animateCount(el, subEl, target, duration = 1600) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    const val = target * ease;
    el.textContent = formatShort(val);
    if (subEl) subEl.textContent = formatMoney(val);
    if (t < 1) requestAnimationFrame(tick);
    else {
      el.textContent = formatShort(target);
      if (subEl) subEl.textContent = formatMoney(target);
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 600);
      fitAmountFont(el);
    }
  }
  requestAnimationFrame(tick);
}

function fitAmountFont(el) {
  const wrap = el.parentElement;
  if (!wrap) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  const minSize = 24;
  while (el.scrollWidth > wrap.clientWidth && size > minSize) {
    size -= 2;
    el.style.fontSize = size + 'px';
  }
}

// --- Clock ---------------------------------------------------------------

function tickClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).toUpperCase();
}
setInterval(tickClock, 1000);
tickClock();

// --- Live premium feed (scrolling bar) -----------------------------------

function buildFeed(data) {
  if (!data) return;
  const items = [];

  items.push({
    code: 'TOTAL',
    val: formatShort(data.ytdTotal),
    chg: null,
    label: 'YTD Premium'
  });

  data.accounts.forEach((a) => {
    const share = ((a.amount / data.ytdTotal) * 100).toFixed(1);
    items.push({ code: a.code, val: formatShort(a.amount), chg: share, label: a.name });
  });

  data.monthly.forEach((m) => {
    if (m.growth != null) {
      items.push({ code: m.period, val: formatShort(m.amount), chg: m.growth, label: m.label });
    }
  });

  const html = items.map((t) => {
    const chgClass = t.chg == null ? 'neutral' : (parseFloat(t.chg) >= 0 ? 'up' : 'down');
    const chgText = t.chg == null ? 'YTD' : (parseFloat(t.chg) >= 0 ? '▲' : '▼') + ' ' + Math.abs(t.chg) + '%';
    return `<span class="tick-item">
      <span class="tick-sym">${t.code}</span>
      <span class="tick-val">${t.val}</span>
      <span class="tick-chg ${chgClass}">${chgText}</span>
    </span>`;
  }).join('');

  tickerTrack.innerHTML = html + html;
}

// --- Progress ------------------------------------------------------------

function startProgress(seconds) {
  clearInterval(progressInterval);
  progressStart = Date.now();
  progressDuration = seconds * 1000;
  progressBar.style.width = '0%';
  progressWrap.classList.add('visible');
  progressInterval = setInterval(() => {
    const pct = Math.min(((Date.now() - progressStart) / progressDuration) * 100, 100);
    progressBar.style.width = pct + '%';
    if (pct >= 100) clearInterval(progressInterval);
  }, 50);
}

function stopProgress() {
  clearInterval(progressInterval);
  progressWrap.classList.remove('visible');
  progressBar.style.width = '0%';
}

// --- Slide list ----------------------------------------------------------

function buildSlideList() {
  const slides = [];
  const rev = settings.revenue;
  if (rev?.enabled && revenueData) {
    const types = rev.slides || ['ytd', 'monthly', 'accounts'];
    const duration = rev.slideDuration || 14;
    types.forEach((type) => slides.push({ type: 'dashboard', dashboardType: type, duration }));
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
    footerEl.classList.remove('visible');
    tickerWrap.classList.remove('visible');
    return false;
  }

  emptyMsg.style.display = 'none';
  footerEl.classList.add('visible');
  tickerWrap.classList.add('visible');
  if (revenueData) buildFeed(revenueData);

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
  } catch (err) { console.error('Failed to fetch settings', err); }
}

async function fetchRevenue() {
  try {
    const res = await fetch('/api/revenue/dashboard', { cache: 'no-store' });
    if (!res.ok) throw new Error('Revenue fetch failed');
    revenueData = await res.json();
    buildFeed(revenueData);
  } catch (err) {
    console.error('Failed to fetch revenue', err);
    revenueData = null;
  }
}

async function fetchPlaylist() {
  try {
    const res = await fetch('/api/playlist', { cache: 'no-store' });
    playlist = await res.json();
  } catch (err) { console.error('Failed to fetch playlist', err); }
}

async function refreshAll() {
  await fetchSettings();
  await Promise.all([fetchRevenue(), fetchPlaylist()]);
  const hadSlides = slideList.length > 0;
  const ok = rebuildSlides();
  if (ok && !hadSlides) { currentIndex = 0; showCurrent(); }
  else if (ok && !currentEl) { currentIndex = 0; showCurrent(); }
  else if (ok && currentEl?.classList?.contains('rev-slide')) showCurrent();
  else updateHud();
}

setInterval(refreshAll, 5 * 60 * 1000);
setInterval(fetchPlaylist, 10000);

function updateHud() {
  if (slideList.length === 0) return;
  const item = slideList[currentIndex];
  const label = item.type === 'dashboard'
    ? SLIDE_LABELS[item.dashboardType]
    : SLIDE_LABELS[item.type] || 'FEED';
  slideLabelEl.textContent = '◆ ' + label + ' ◆';
  counterEl.textContent = `SCREEN ${currentIndex + 1} / ${slideList.length}`;
  dotsEl.innerHTML = slideList.map((_, i) =>
    `<div class="dot${i === currentIndex ? ' active' : ''}"></div>`
  ).join('');
}

// --- Slide builders (insurance premium dashboard) ------------------------

function panelHeader(code, title, sub, badge) {
  return `
    <div class="rev-header">
      <div class="rev-header-left">
        <div class="rev-index-code">${code}</div>
        <div>
          <div class="rev-title">${title}</div>
          <div class="rev-subtitle">${sub}</div>
        </div>
      </div>
      <div class="rev-year-badge">FY ${badge}</div>
    </div>`;
}

function buildYtdSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel';
  const latest = data.monthly[data.monthly.length - 1];
  const latestGrowth = latest?.growth;
  const chgClass = latestGrowth == null ? 'up' : (latestGrowth >= 0 ? 'up' : 'down');
  const chgText = latestGrowth == null ? '▲ LIVE DATA' : (latestGrowth >= 0 ? '▲' : '▼') + ' ' + Math.abs(latestGrowth) + '% vs last month';

  el.innerHTML = `
    ${panelHeader('YTD', 'Year-to-Date Premium Summary', 'Geminia Life Insurance · All Posted Premium Accounts', data.year)}
    <div class="rev-index-body">
      <div class="rev-panel rev-index-hero">
        <div class="rev-index-hero-left">
          <div class="rev-index-label">Total Premium Collected</div>
          <div class="rev-index-name">YTD PREMIUM REVENUE</div>
          <div class="rev-index-amount-wrap">
            <div class="rev-index-amount" data-target="${data.ytdTotal}">KES 0</div>
            <div class="rev-index-amount-sub">KES 0</div>
          </div>
        </div>
        <div class="rev-index-change ${chgClass}">${chgText}</div>
      </div>
      <div class="rev-index-stats">
        <div class="rev-stat-box">
          <div class="rev-stat-box-label">Accounts</div>
          <div class="rev-stat-box-val">${data.accountCount}</div>
        </div>
        <div class="rev-stat-box">
          <div class="rev-stat-box-label">Months</div>
          <div class="rev-stat-box-val">${data.monthCount}</div>
        </div>
        <div class="rev-stat-box">
          <div class="rev-stat-box-label">Status</div>
          <div class="rev-stat-box-val" style="color:#00e676">ACTIVE</div>
        </div>
        <div class="rev-stat-box">
          <div class="rev-stat-box-label">Source</div>
          <div class="rev-stat-box-val">ORACLE ERP</div>
        </div>
      </div>
      <div class="rev-panel rev-index-table-row rev-table-wrap">
        <div class="rev-table-head">
          <span>Account</span><span>Product Name</span><span style="text-align:right">Premium (KES)</span><span style="text-align:right">Share</span>
        </div>
        <div class="rev-table-body">
          ${data.topAccounts.map((a) => {
            const pct = ((a.amount / data.ytdTotal) * 100).toFixed(1);
            return `
              <div class="rev-row">
                <span class="rev-sym">${a.code}</span>
                <span class="rev-name">${a.name}</span>
                <span class="rev-price">${formatShort(a.amount)}</span>
                <span class="rev-chg up">${pct}%</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    const amtEl = el.querySelector('.rev-index-amount');
    const subEl = el.querySelector('.rev-index-amount-sub');
    animateCount(amtEl, subEl, data.ytdTotal);
  });
  return el;
}

function buildMonthlySlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel';
  const maxAmt = Math.max(...data.monthly.map((m) => m.amount), 1);
  const best = [...data.monthly].sort((a, b) => b.amount - a.amount)[0];
  const worst = [...data.monthly].sort((a, b) => a.amount - b.amount)[0];
  const withGrowth = data.monthly.filter((m) => m.growth != null);
  const avgGrowth = withGrowth.length
    ? (withGrowth.reduce((s, m) => s + m.growth, 0) / withGrowth.length).toFixed(1) : null;
  const upMonths = withGrowth.filter((m) => m.growth > 0).length;

  el.innerHTML = `
    ${panelHeader('MONTHLY', 'Monthly Premium Trend', 'Premium by period · Posted transactions', data.year)}
    <div class="rev-monthly-body">
      <div class="rev-chart-area">
        ${data.monthly.map((m) => {
          const pct = (m.amount / maxAmt * 100).toFixed(1);
          const dir = m.growth == null ? 'neutral' : (m.growth >= 0 ? 'up' : 'down');
          const chgText = m.growth == null ? '—' : (m.growth >= 0 ? '▲' : '▼') + Math.abs(m.growth) + '%';
          return `
            <div class="rev-candle-col">
              <div class="rev-candle-chg ${dir}">${chgText}</div>
              <div class="rev-candle-wrap">
                <div class="rev-candle ${dir}" data-pct="${pct}"></div>
              </div>
              <div class="rev-candle-val">${formatShort(m.amount)}</div>
              <div class="rev-candle-lbl">${m.shortLabel}</div>
            </div>`;
        }).join('')}
      </div>
      <div class="rev-strip">
        <div class="rev-strip-item">
          <div class="rev-strip-label">Highest Month</div>
          <div class="rev-strip-val green">${best?.shortLabel || '—'} · ${best ? formatShort(best.amount) : ''}</div>
        </div>
        <div class="rev-strip-item">
          <div class="rev-strip-label">Lowest Month</div>
          <div class="rev-strip-val red">${worst?.shortLabel || '—'} · ${worst ? formatShort(worst.amount) : ''}</div>
        </div>
        <div class="rev-strip-item">
          <div class="rev-strip-label">Avg Monthly Growth</div>
          <div class="rev-strip-val ${avgGrowth >= 0 ? 'green' : 'red'}">${avgGrowth != null ? (avgGrowth >= 0 ? '+' : '') + avgGrowth + '%' : '—'}</div>
        </div>
        <div class="rev-strip-item">
          <div class="rev-strip-label">Growing Months</div>
          <div class="rev-strip-val amber">${upMonths} of ${withGrowth.length}</div>
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    el.querySelectorAll('.rev-candle').forEach((bar) => {
      bar.style.height = bar.dataset.pct + '%';
    });
  });
  return el;
}

function buildAccountsSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel';

  el.innerHTML = `
    ${panelHeader('ACCOUNTS', 'Premium Account Breakdown', 'All insurance premium accounts · Posted', data.year)}
    <div class="rev-board-body">
      <div class="rev-table-head">
        <span>Account</span><span>Product Name</span><span style="text-align:right">Premium (KES)</span><span style="text-align:right">Share</span>
      </div>
      <div class="rev-table-body">
        ${data.accounts.map((a) => {
          const pct = ((a.amount / data.ytdTotal) * 100).toFixed(1);
          return `
            <div class="rev-row">
              <span class="rev-sym">${a.code}</span>
              <span class="rev-name">${a.name}</span>
              <span class="rev-price">${formatShort(a.amount)}</span>
              <span class="rev-chg up">${pct}%</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;
  return el;
}

function buildDashboardEl(type) {
  if (!revenueData) {
    const el = document.createElement('div');
    el.className = 'rev-slide';
    el.innerHTML = '<div class="rev-loading"><div class="rev-spinner"></div>Connecting to Oracle ERP...</div>';
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
  updateHud();

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
    setTimeout(() => prevEl.remove(), 900);
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

setTimeout(() => fullscreenHint.classList.add('hidden'), 6000);
