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
const dataUpdatedEl = document.getElementById('data-updated');

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

const SLIDE_LABELS = {
  ytd: 'YTD PREMIUM SUMMARY',
  portfolio: 'EXPECTED VS ACTUAL',
  budget: 'EXPECTED VS ACTUAL',
  monthly: 'MONTHLY PREMIUM TREND',
  accounts: 'ACCOUNT BREAKDOWN',
  image: 'MEDIA',
  video: 'MEDIA'
};

function formatMoney(n) { return fmt.format(Math.round(n)); }

/** Full amount with thousands separators (TV-safe exact figure). */
function formatMoneyValue(n) {
  const formatted = fmt.format(Math.round(n)).replace(/\u00a0/g, ' ');
  const spaceIdx = formatted.indexOf(' ');
  return spaceIdx === -1 ? formatted : formatted.slice(spaceIdx + 1);
}

function moneyHtml(n, opts = {}) {
  const formatted = fmt.format(Math.round(n)).replace(/\u00a0/g, ' ');
  const spaceIdx = formatted.indexOf(' ');
  const cls = ['money', opts.hero && 'money-hero', opts.accent && 'accent', opts.sm && 'sm'].filter(Boolean).join(' ');
  if (spaceIdx === -1) {
    return `<span class="${cls}"><span class="money-num">${formatted}</span></span>`;
  }
  const currency = formatted.slice(0, spaceIdx);
  const value = formatted.slice(spaceIdx + 1);
  return `<span class="${cls}"><span class="money-cur">${currency}</span><span class="money-num">${value}</span></span>`;
}

function getMilestone(total) {
  if (total >= 1_000_000_000) return { text: 'Over One Billion Shillings in Premium', cls: 'gold' };
  if (total >= 500_000_000) return { text: 'Half a Billion Milestone Reached', cls: 'silver' };
  if (total >= 100_000_000) return { text: 'KES 100 Million and Counting', cls: 'green' };
  return null;
}

// --- Animated count-up (exact amounts only) ------------------------------

function animateCount(el, target, duration = 2000) {
  const numEl = el.querySelector('.money-num');
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    const current = Math.round(target * ease);
    if (numEl) {
      numEl.textContent = formatMoneyValue(current);
    } else {
      el.textContent = formatMoney(current);
    }
    if (t < 1) requestAnimationFrame(tick);
    else {
      if (numEl) numEl.textContent = formatMoneyValue(target);
      else el.innerHTML = moneyHtml(target);
      el.classList.add('flash', 'landed');
      fitAmountFont(el);
      setTimeout(() => el.classList.remove('flash'), 800);
    }
  }
  requestAnimationFrame(tick);
}

function fitAmountFont(el) {
  if (!el) return;
  const wrap = el.closest('.rev-index-amount-wrap')
    || el.closest('.rev-score-box')
    || el.closest('.rev-hero-card')
    || el.parentElement;
  const measureEl = el.querySelector('.money') || el;
  if (!wrap) return;
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  const minSize = 14;
  let guard = 80;
  while (guard-- > 0 && measureEl.scrollWidth > wrap.clientWidth - 10 && size > minSize) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

/** Shrink any money figure that overflows its cell. */
function fitOverflowMoney(root) {
  root.querySelectorAll('.money').forEach((money) => {
    const cell = money.closest('.rev-price, .rev-score-num, .rev-index-amount, .rev-strip-val, .rev-insight-amt, .rev-candle-val') || money.parentElement;
    if (!cell) return;
    money.style.fontSize = '';
    money.style.transform = '';
    const avail = cell.clientWidth;
    if (avail < 8 || money.scrollWidth <= avail) return;
    const scale = Math.max(0.55, (avail - 4) / money.scrollWidth);
    money.style.transform = `scale(${scale})`;
    money.style.transformOrigin = money.closest('.rev-price, .col-money, .rev-candle-val') ? 'right center' : 'left center';
  });
}

function fitTvTables(root) {
  const slide = root || currentEl;
  if (!slide?.classList?.contains('rev-slide')) return;
  if (slide.classList.contains('rev-slide-ytd')) return;
  const body = slide.querySelector('.rev-table-body');
  if (!body) return;
  const rows = body.querySelectorAll('.rev-row');
  if (!rows.length) return;

  const bodyH = body.clientHeight;
  if (bodyH < 20) {
    requestAnimationFrame(() => fitSlide(slide));
    return;
  }

  const rowH = Math.max(28, Math.floor(bodyH / rows.length));
  const fontPx = Math.min(18, Math.max(11, Math.round(rowH * 0.34)));
  const rankSize = Math.min(28, Math.max(18, Math.round(rowH * 0.45)));
  const hasBar = !!body.querySelector('.rev-share-bar');

  rows.forEach((row) => {
    row.style.height = rowH + 'px';
    row.style.minHeight = rowH + 'px';
    row.style.maxHeight = rowH + 'px';
    row.style.fontSize = fontPx + 'px';
    const vPad = hasBar
      ? Math.max(2, Math.floor((rowH - fontPx - 6) / 2))
      : Math.max(2, Math.floor((rowH - fontPx) / 2));
    row.style.paddingTop = vPad + 'px';
    row.style.paddingBottom = vPad + 'px';
    const rank = row.querySelector('.rev-rank');
    if (rank) {
      rank.style.width = rankSize + 'px';
      rank.style.height = rankSize + 'px';
      rank.style.fontSize = Math.max(9, fontPx - 1) + 'px';
    }
    const bar = row.querySelector('.rev-share-bar');
    if (bar) {
      bar.style.width = bar.dataset.pct + '%';
      bar.style.height = Math.max(2, Math.min(4, Math.floor(rowH * 0.08))) + 'px';
    }
  });
}

function fitMonthlyChart(root) {
  const area = root.querySelector('.rev-chart-area');
  if (!area) return;
  const wraps = area.querySelectorAll('.rev-candle-wrap');
  if (!wraps.length) return;
  const areaH = area.clientHeight;
  if (areaH < 40) {
    requestAnimationFrame(() => fitSlide(root));
    return;
  }
  // Reserve space for badge, change %, value, label
  const reserved = 72;
  const barH = Math.max(48, areaH - reserved);
  wraps.forEach((w) => {
    w.style.height = barH + 'px';
  });
}

/** Fit the active dashboard slide to the TV viewport — nothing clipped. */
function fitSlide(root) {
  const slide = root || currentEl;
  if (!slide?.classList?.contains('rev-slide')) return;

  fitTvTables(slide);
  fitScoreboard(slide);
  fitMonthlyChart(slide);

  slide.querySelectorAll('.rev-index-amount, .rev-score-num').forEach(fitAmountFont);
  fitOverflowMoney(slide);

  // Last resort scale — portfolio uses fixed CSS grid, skip to avoid clipping rows
  const panel = slide.classList.contains('rev-panel') ? slide : slide.querySelector('.rev-panel');
  if (panel && !slide.classList.contains('rev-slide-portfolio')
      && !slide.classList.contains('rev-slide-ytd')) {
    panel.style.transform = '';
    panel.style.transformOrigin = '';
    panel.style.marginBottom = '';
    const stageH = slide.clientHeight || stage.clientHeight;
    const panelH = panel.scrollHeight;
    if (stageH > 40 && panelH > stageH + 4) {
      const scale = Math.max(0.72, stageH / panelH);
      panel.style.transform = `scale(${scale})`;
      panel.style.transformOrigin = 'top center';
      // transform doesn't shrink layout box — pull up leftover space
      panel.style.marginBottom = `-${Math.ceil(panelH * (1 - scale))}px`;
    }
  }
}

const REVENUE_POLL_MS = 60 * 1000;

function updateDataTimestamp(fresh = false) {
  if (!dataUpdatedEl) return;
  if (!revenueData?.fetchedAt) {
    dataUpdatedEl.textContent = 'Connecting…';
    dataUpdatedEl.classList.remove('fresh');
    return;
  }
  const d = new Date(revenueData.fetchedAt);
  dataUpdatedEl.textContent = 'Updated ' + d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  dataUpdatedEl.classList.toggle('fresh', fresh);
  if (fresh) setTimeout(() => dataUpdatedEl.classList.remove('fresh'), 3000);
}

function refreshCurrentDashboard() {
  const item = slideList[currentIndex];
  if (item?.type !== 'dashboard' || !currentEl?.classList?.contains('rev-slide')) return;
  const newEl = buildDashboardEl(item.dashboardType);
  newEl.classList.add('active');
  stage.appendChild(newEl);
  const old = currentEl;
  currentEl = newEl;
  old.classList.remove('active');
  setTimeout(() => old.remove(), 400);
  requestAnimationFrame(() => {
    fitSlide(newEl);
  });
}

function animateBars(container, selector, attr, suffix = '%') {
  requestAnimationFrame(() => {
    container.querySelectorAll(selector).forEach((bar) => {
      bar.style[attr] = bar.dataset.pct + suffix;
    });
  });
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

// --- Live premium feed ---------------------------------------------------

function buildFeed(data) {
  if (!data) return;
  const items = [
    { code: 'YTD TOTAL', val: formatMoney(data.ytdTotal), chg: null },
    ...[...data.accounts].sort((a, b) => b.amount - a.amount).map((a) => ({
      code: a.code,
      val: formatMoney(a.amount),
      chg: data.ytdTotal > 0 ? ((a.amount / data.ytdTotal) * 100).toFixed(1) : '0.0'
    }))
  ];

  const html = items.map((t) => {
    const chgClass = t.chg == null ? 'neutral' : 'up';
    const chgText = t.chg == null ? 'EXACT' : t.chg + '% share';
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

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    settings = await res.json();
  } catch (err) { console.error('Failed to fetch settings', err); }
}

function revenueFingerprint(data) {
  if (!data) return '';
  const { fetchedAt, ...rest } = data;
  return JSON.stringify(rest);
}

async function fetchRevenue() {
  try {
    const res = await fetch('/api/revenue/dashboard?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Revenue fetch failed');
    const prev = revenueFingerprint(revenueData);
    revenueData = await res.json();
    buildFeed(revenueData);
    updateDataTimestamp(true);
    return prev !== revenueFingerprint(revenueData);
  } catch (err) {
    console.error('Failed to fetch revenue', err);
    revenueData = null;
    updateDataTimestamp();
    return false;
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
  const changed = await fetchRevenue();
  await fetchPlaylist();
  const hadSlides = slideList.length > 0;
  const ok = rebuildSlides();
  if (ok && !hadSlides) { currentIndex = 0; showCurrent(); }
  else if (ok && !currentEl) { currentIndex = 0; showCurrent(); }
  else if (ok && changed && currentEl?.classList?.contains('rev-slide')) refreshCurrentDashboard();
  else if (ok && currentEl?.classList?.contains('rev-slide')) showCurrent();
  else updateHud();
}

async function pollRevenue() {
  const changed = await fetchRevenue();
  if (slideList.length > 0) {
    if (changed) {
      rebuildSlides();
      if (currentEl?.classList?.contains('rev-slide')) refreshCurrentDashboard();
      else updateHud();
    }
  }
}

setInterval(pollRevenue, REVENUE_POLL_MS);
setInterval(refreshAll, 5 * 60 * 1000);
setInterval(fetchPlaylist, 10000);

function updateHud() {
  if (slideList.length === 0) return;
  const item = slideList[currentIndex];
  const label = item.type === 'dashboard'
    ? SLIDE_LABELS[item.dashboardType]
    : SLIDE_LABELS[item.type] || 'FEED';
  slideLabelEl.textContent = label;
  counterEl.textContent = `${currentIndex + 1} / ${slideList.length}`;
  dotsEl.innerHTML = slideList.map((_, i) =>
    `<div class="dot${i === currentIndex ? ' active' : ''}"></div>`
  ).join('');
}

// --- Slide builders ------------------------------------------------------

function panelHeader(code, title, sub, badge) {
  return `
    <div class="rev-header">
      <div class="rev-header-left">
        <div class="rev-index-code">${code}</div>
        <div class="rev-header-text">
          <div class="rev-title">${title}</div>
          <div class="rev-subtitle">${sub}</div>
        </div>
      </div>
      <div class="rev-year-badge">FY ${badge}</div>
    </div>`;
}

function statusLabel(status) {
  if (status === 'on_track') return 'ON TRACK';
  if (status === 'at_risk') return 'AT RISK';
  if (status === 'failing') return 'BEHIND';
  if (status === 'untracked') return 'ACTUAL';
  return '—';
}

function statusClass(status) {
  if (status === 'on_track') return 'ok';
  if (status === 'at_risk') return 'risk';
  if (status === 'failing') return 'fail';
  if (status === 'untracked') return 'plain';
  return '';
}

function compactMoney(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(Math.round(n));
}

function buildPortfolioSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel rev-slide-portfolio';
  const b = data.budget;
  if (!b?.products?.length && !b?.lines?.length) {
    const reason = !data.budget
      ? 'Server is missing budget backend files (lib/budgets.js + data/budgets-2026.json). Redeploy and restart.'
      : (!b.throughLabel || b.throughLabel === 'No posted months yet')
        ? 'No posted months yet for budget pacing.'
        : 'Budget file loaded but no product segments were built.';
    el.innerHTML = `
      ${panelHeader('PORTFOLIO', 'Expected vs Actual', 'All products · budget pace', data.year)}
      <div class="rev-loading">${reason}</div>`;
    return el;
  }

  const s = b.summary;
  const products = [...(b.products || b.chart || b.lines)]
    .sort((a, c) => Math.max(c.budgetYtd, c.actualYtd) - Math.max(a.budgetYtd, a.actualYtd));
  const scaleMax = Math.max(...products.map((p) => Math.max(p.budgetYtd || 0, p.actualYtd || 0)), 1);
  const gapLabel = s.variance < 0
    ? `SHORT ${compactMoney(Math.abs(s.variance))}`
    : `AHEAD ${compactMoney(s.variance)}`;
  const mid = Math.ceil(products.length / 2);
  const left = products.slice(0, mid);
  const right = products.slice(mid);

  function portfolioRow(p, rank) {
    const isDef = (p.budgetYtd || 0) > 0 && p.variance < 0;
    const isSur = (p.budgetYtd || 0) > 0 && p.variance > 0;
    const expW = ((p.budgetYtd || 0) / scaleMax) * 100;
    const actW = ((p.actualYtd || 0) / scaleMax) * 100;
    const gapTxt = !(p.budgetYtd > 0)
      ? '—'
      : (isDef ? '−' : '+') + compactMoney(Math.abs(p.variance));
    const pctTxt = p.pctOfBudget != null ? p.pctOfBudget + '%' : '—';
    return `
      <div class="rev-score-row ${statusClass(p.status)}">
        <span class="rev-rank">${rank}</span>
        <span class="rev-name" title="${p.fullName || p.name}">
          <span class="rev-code">${p.code || p.id || ''}</span>${p.shortName || p.name}
        </span>
        <span class="rev-price col-money muted">${moneyHtml(p.budgetYtd || 0, { sm: true })}</span>
        <span class="rev-price col-money">${moneyHtml(p.actualYtd || 0, { sm: true })}</span>
        <span class="rev-chg ${statusClass(p.status)}">${pctTxt}</span>
        <span class="rev-gap ${isDef ? 'fail' : (isSur ? 'ok' : 'plain')}">${gapTxt}</span>
        <span class="rev-score-bars">
          <span class="rev-score-bar exp" style="width:${Math.max(expW, 1)}%"></span>
          <span class="rev-score-bar act ${statusClass(p.status)}" style="width:${Math.max(actW, 1)}%"></span>
        </span>
      </div>`;
  }

  function portfolioColumn(list, startRank) {
    return `
      <div class="rev-score-table">
        <div class="rev-score-head">
          <span>#</span><span>Product</span><span class="col-money">Expected</span>
          <span class="col-money">Actual</span><span>Pace</span><span class="col-money">Gap</span><span>Progress</span>
        </div>
        <div class="rev-score-rows">
          ${list.map((p, i) => portfolioRow(p, startRank + i)).join('')}
        </div>
      </div>`;
  }

  el.innerHTML = `
    ${panelHeader('SCOREBOARD', 'Expected vs Actual Premium', 'All ' + products.length + ' products · YTD ' + b.throughLabel + ' · Book5 budget vs Oracle posted', data.year)}
    <div class="rev-score-body">
      <div class="rev-score-kpi ${statusClass(s.status)}">
        <div class="rev-score-box expected">
          <div class="rev-score-tag">EXPECTED (BUDGET)</div>
          <div class="rev-score-num">${moneyHtml(s.budgetYtd)}</div>
          <div class="rev-score-sub">Book5 Overall Life · ${b.throughLabel}</div>
        </div>
        <div class="rev-score-box actual">
          <div class="rev-score-tag accent">ACTUAL (POSTED)</div>
          <div class="rev-score-num accent">${moneyHtml(s.actualYtd)}</div>
          <div class="rev-score-sub">Oracle YTD total · matches summary</div>
        </div>
        <div class="rev-score-box gap ${s.variance < 0 ? 'fail' : 'ok'}">
          <div class="rev-score-tag">${s.variance < 0 ? 'DEFICIT' : 'SURPLUS'}</div>
          <div class="rev-score-num ${s.variance < 0 ? 'fail' : 'ok'}">${moneyHtml(Math.abs(s.variance))}</div>
          <div class="rev-score-sub">${s.pctOfBudget}% of expected · ${gapLabel}</div>
        </div>
      </div>

      <div class="rev-score-flags">
        <span class="rev-flag fail">${s.failingCount} behind</span>
        <span class="rev-flag risk">${s.atRiskCount} at risk</span>
        <span class="rev-flag ok">${b.onTrackCount} on track</span>
        <span class="rev-legend-note">${products.length} products · grey = expected · cyan/red = actual</span>
      </div>

      <div class="rev-score-split">
        ${portfolioColumn(left, 1)}
        ${portfolioColumn(right, mid + 1)}
      </div>
    </div>`;

  requestAnimationFrame(() => fitSlide(el));
  return el;
}

function fitScoreboard(root) {
  if (root.classList?.contains('rev-slide-portfolio')) return;
  const rowsWrap = root.querySelector('.rev-score-rows');
  if (!rowsWrap) return;
  const rows = rowsWrap.querySelectorAll('.rev-score-row');
  if (!rows.length) return;
  const h = rowsWrap.clientHeight;
  if (h < 40) {
    requestAnimationFrame(() => fitSlide(root));
    return;
  }
  const rowH = Math.max(26, Math.floor(h / rows.length));
  const fontPx = Math.min(16, Math.max(10, Math.round(rowH * 0.38)));
  rows.forEach((row) => {
    row.style.height = rowH + 'px';
    row.style.minHeight = rowH + 'px';
    row.style.maxHeight = rowH + 'px';
    row.style.fontSize = fontPx + 'px';
    row.style.paddingTop = '0';
    row.style.paddingBottom = '0';
  });
}

function buildBudgetSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel';
  const b = data.budget;
  if (!b?.lines?.length && !b?.products?.length) {
    el.innerHTML = `
      ${panelHeader('BUDGET', 'Expected vs Actual', 'No budget file loaded for ' + data.year, data.year)}
      <div class="rev-loading">Add data/budgets-${data.year}.json to enable comparisons</div>`;
    return el;
  }

  const s = b.summary;
  const chart = [...(b.chart || b.products || b.lines)]
    .sort((a, c) => Math.max(c.budgetYtd, c.actualYtd) - Math.max(a.budgetYtd, a.actualYtd));
  const scaleMax = Math.max(...chart.map((l) => Math.max(l.budgetYtd || 0, l.actualYtd || 0)), 1);

  const W = 1100;
  const H = 320;
  const padL = 48;
  const padR = 10;
  const padT = 18;
  const padB = 52;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = chart.length;
  const groupW = plotW / Math.max(n, 1);
  const barW = Math.min(26, groupW * 0.34);
  const yMax = scaleMax * 1.1;
  const y = (v) => padT + plotH - (v / yMax) * plotH;
  const gridVals = [0.25, 0.5, 0.75, 1].map((p) => yMax * p);

  const chartSvg = `
    <svg class="rev-vs-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Expected versus actual by product">
      ${gridVals.map((gv) => `
        <line class="rev-vs-grid" x1="${padL}" y1="${y(gv)}" x2="${W - padR}" y2="${y(gv)}" />
        <text class="rev-vs-axis" x="${padL - 6}" y="${y(gv) + 4}" text-anchor="end">${compactMoney(gv)}</text>
      `).join('')}
      <line class="rev-vs-axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" />
      <line class="rev-vs-axis-line" x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" />
      ${chart.map((line, i) => {
        const cx = padL + groupW * i + groupW / 2;
        const bh = Math.max(padT + plotH - y(line.budgetYtd || 0), 2);
        const ah = Math.max(padT + plotH - y(line.actualYtd || 0), 2);
        const isDef = (line.budgetYtd || 0) > 0 && line.variance < 0;
        const actualClass = !(line.budgetYtd > 0) ? 'plain' : (isDef ? 'fail' : 'ok');
        return `
          <g>
            <rect class="rev-vs-col budget" x="${cx - barW - 2}" y="${y(line.budgetYtd || 0)}" width="${barW}" height="${bh}" rx="2" />
            <rect class="rev-vs-col actual ${actualClass}" x="${cx + 2}" y="${y(line.actualYtd || 0)}" width="${barW}" height="${ah}" rx="2" />
            <text class="rev-vs-col-lbl" x="${cx}" y="${H - 28}" text-anchor="middle">${line.code || ''}</text>
            <text class="rev-vs-col-lbl sub" x="${cx}" y="${H - 14}" text-anchor="middle">${line.name}</text>
            <text class="rev-vs-col-pct ${actualClass}" x="${cx}" y="${H - 2}" text-anchor="middle">${line.pctOfBudget != null ? line.pctOfBudget + '%' : '—'}</text>
          </g>`;
      }).join('')}
    </svg>`;

  el.innerHTML = `
    ${panelHeader('COMPARE', 'Expected vs Actual', 'YTD ' + b.throughLabel + ' · grey = expected budget · colour = Oracle actual', data.year)}
    <div class="rev-budget-body vs-body tight">
      <div class="rev-score-hero compact ${statusClass(s.status)}">
        <div class="rev-score-box expected">
          <div class="rev-score-tag">EXPECTED</div>
          <div class="rev-score-num">${moneyHtml(s.budgetYtd)}</div>
        </div>
        <div class="rev-score-vs">VS</div>
        <div class="rev-score-box actual">
          <div class="rev-score-tag accent">ACTUAL</div>
          <div class="rev-score-num accent">${moneyHtml(s.actualYtd)}</div>
        </div>
        <div class="rev-score-box gap ${s.variance < 0 ? 'fail' : 'ok'}">
          <div class="rev-score-tag">${s.variance < 0 ? 'DEFICIT' : 'SURPLUS'}</div>
          <div class="rev-score-num ${s.variance < 0 ? 'fail' : 'ok'}">${moneyHtml(Math.abs(s.variance))}</div>
          <div class="rev-score-sub">${s.pctOfBudget}% delivered</div>
        </div>
      </div>

      <div class="rev-vs-chart-wrap grow">
        <div class="rev-vs-chart-head">
          <div class="rev-section-head" style="margin:0">All 12 products — Expected (grey) beside Actual</div>
          <div class="rev-vs-legend">
            <span class="rev-vs-leg budget"><i></i>Expected</span>
            <span class="rev-vs-leg actual"><i></i>Actual on/above</span>
            <span class="rev-vs-leg fail"><i></i>Actual behind</span>
          </div>
        </div>
        ${chartSvg}
      </div>
    </div>`;

  return el;
}

function buildYtdSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel rev-slide-ytd';
  const latest = data.monthly[data.monthly.length - 1];
  const latestGrowth = latest?.growth;
  const chgClass = latestGrowth == null ? 'up' : (latestGrowth >= 0 ? 'up' : 'down');
  const chgText = latestGrowth == null
    ? 'Live from Oracle ERP'
    : `${latestGrowth >= 0 ? '+' : '−'}${Math.abs(latestGrowth)}% month on month`;
  const milestone = getMilestone(data.ytdTotal);
  const top = data.topAccounts[0];
  const budgetSummary = data.budget?.summary;
  const sorted = [...data.accounts].sort((a, b) => b.amount - a.amount);
  const mid = Math.ceil(sorted.length / 2);
  const left = sorted.slice(0, mid);
  const right = sorted.slice(mid);

  function ytdRow(a, rank) {
    const pct = data.ytdTotal > 0 ? ((a.amount / data.ytdTotal) * 100).toFixed(1) : '0.0';
    return `
      <div class="rev-row${rank === 1 ? ' top-row' : ''}">
        <span class="rev-rank">${rank}</span>
        <span class="rev-name" title="${a.name}"><span class="rev-code">${a.code}</span>${a.name}</span>
        <span class="rev-price col-money">${moneyHtml(a.amount, { sm: true })}</span>
        <span class="rev-chg up">${pct}%</span>
      </div>`;
  }

  function ytdColumn(list, startRank) {
    return `
      <div class="rev-index-table-row">
        <div class="rev-table-head">
          <span>#</span><span>Product Name</span><span class="col-money">Premium</span><span>Share</span>
        </div>
        <div class="rev-table-body">
          ${list.map((a, i) => ytdRow(a, startRank + i)).join('')}
        </div>
      </div>`;
  }

  el.innerHTML = `
    ${panelHeader('YTD', 'Year-to-Date Premium Summary', 'Posted premium · ' + data.year, data.year)}
    <div class="rev-ytd-body">
      ${milestone ? `<div class="rev-milestone ${milestone.cls}">${milestone.text}</div>` : ''}

      <div class="rev-ytd-kpi">
        <div class="rev-ytd-total">
          <div class="rev-index-label">Total Premium Collected</div>
          <div class="rev-index-amount-wrap">
            <div class="rev-index-amount">${moneyHtml(0, { hero: true })}</div>
          </div>
          <div class="rev-exact-tag">Exact posted figures · Oracle ERP</div>
        </div>
        <div class="rev-ytd-stats">
          <div class="rev-ytd-stat">
            <div class="rev-insight-label">Month on Month</div>
            <div class="rev-insight-val ${chgClass}">${chgText}</div>
          </div>
          ${top ? `
          <div class="rev-ytd-stat highlight">
            <div class="rev-insight-label">Top Account</div>
            <div class="rev-insight-name">${top.name}</div>
            <div class="rev-insight-amt">${moneyHtml(top.amount, { sm: true })}</div>
          </div>` : ''}
          ${budgetSummary ? `
          <div class="rev-ytd-stat ${budgetSummary.status === 'failing' ? 'fail-bg' : ''}">
            <div class="rev-insight-label">Budget Pace (${data.budget.throughLabel})</div>
            <div class="rev-insight-val ${budgetSummary.variance >= 0 ? 'up' : 'down'}">${budgetSummary.pctOfBudget}% of YTD budget</div>
          </div>` : ''}
          <div class="rev-ytd-stat">
            <div class="rev-insight-label">Portfolio</div>
            <div class="rev-insight-val num">${data.accountCount} accounts · ${data.monthCount} periods</div>
          </div>
        </div>
      </div>

      <div class="rev-section-head">All Products by Premium · ${data.accountCount} accounts</div>
      <div class="rev-ytd-split">
        ${ytdColumn(left, 1)}
        ${ytdColumn(right, mid + 1)}
      </div>
    </div>`;

  requestAnimationFrame(() => {
    animateCount(el.querySelector('.rev-index-amount'), data.ytdTotal);
    fitSlide(el);
    setTimeout(() => fitSlide(el), 120);
    setTimeout(() => fitSlide(el), 2200);
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
    ${panelHeader('MONTHLY', 'Monthly Premium Trend', 'Posted premium by accounting period', data.year)}
    <div class="rev-monthly-body">
      ${best ? `<div class="rev-milestone green">Best month: ${best.label} — ${moneyHtml(best.amount)}</div>` : ''}
      <div class="rev-chart-area">
        ${data.monthly.map((m) => {
          const pct = (m.amount / maxAmt * 100).toFixed(1);
          const dir = m.growth == null ? 'neutral' : (m.growth >= 0 ? 'up' : 'down');
          const chgText = m.growth == null ? '—' : `${m.growth >= 0 ? '+' : '−'}${Math.abs(m.growth)}%`;
          const isBest = best && m.period === best.period;
          return `
            <div class="rev-candle-col${isBest ? ' best-month' : ''}">
              ${isBest ? '<div class="rev-best-badge">BEST</div>' : ''}
              <div class="rev-candle-chg ${dir}">${chgText}</div>
              <div class="rev-candle-wrap">
                <div class="rev-candle ${dir}" data-pct="${pct}"></div>
              </div>
              <div class="rev-candle-val">${moneyHtml(m.amount, { sm: true })}</div>
              <div class="rev-candle-lbl">${m.shortLabel}</div>
            </div>`;
        }).join('')}
      </div>
      <div class="rev-strip">
        <div class="rev-strip-item">
          <div class="rev-strip-label">Highest Month</div>
          <div class="rev-strip-val green">${best ? best.shortLabel + ' — ' : ''}${best ? moneyHtml(best.amount, { sm: true }) : '—'}</div>
        </div>
        <div class="rev-strip-item">
          <div class="rev-strip-label">Lowest Month</div>
          <div class="rev-strip-val red">${worst ? worst.shortLabel + ' — ' : ''}${worst ? moneyHtml(worst.amount, { sm: true }) : '—'}</div>
        </div>
        <div class="rev-strip-item">
          <div class="rev-strip-label">Avg Growth</div>
          <div class="rev-strip-val num ${avgGrowth >= 0 ? 'green' : 'red'}">${avgGrowth != null ? (avgGrowth >= 0 ? '+' : '') + avgGrowth + '%' : '—'}</div>
        </div>
        <div class="rev-strip-item">
          <div class="rev-strip-label">Growing Months</div>
          <div class="rev-strip-val num amber">${upMonths} of ${withGrowth.length}</div>
        </div>
      </div>
    </div>`;

  animateBars(el, '.rev-candle', 'height');
  requestAnimationFrame(() => fitSlide(el));
  return el;
}

function buildAccountsSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel';
  const sorted = [...data.accounts].sort((a, b) => b.amount - a.amount);

  el.innerHTML = `
    ${panelHeader('ACCOUNTS', 'All Products by Premium', data.accountCount + ' accounts · full portfolio', data.year)}
    <div class="rev-board-body">
      <div class="rev-index-table-row">
      <div class="rev-table-head">
        <span>#</span><span>Product Name</span><span class="col-money">Premium Amount</span><span>Share</span>
      </div>
      <div class="rev-table-body">
        ${sorted.map((a, i) => {
          const pct = data.ytdTotal > 0 ? ((a.amount / data.ytdTotal) * 100).toFixed(1) : '0.0';
          return `
            <div class="rev-row${i < 3 ? ' top-row' : ''}">
              <span class="rev-rank">${i + 1}</span>
              <span class="rev-name" title="${a.name}"><span class="rev-code">${a.code}</span>${a.name}</span>
              <span class="rev-price col-money">${moneyHtml(a.amount)}</span>
              <span class="rev-chg up">${pct}%</span>
            </div>`;
        }).join('')}
      </div>
      </div>
    </div>`;
  requestAnimationFrame(() => fitSlide(el));
  return el;
}

function buildDashboardEl(type) {
  if (!revenueData) {
    const el = document.createElement('div');
    el.className = 'rev-slide';
    el.innerHTML = '<div class="rev-loading"><div class="rev-spinner"></div>Loading exact premium data from Oracle ERP...</div>';
    return el;
  }
  if (type === 'ytd') return buildYtdSlide(revenueData);
  if (type === 'portfolio') return buildPortfolioSlide(revenueData);
  if (type === 'budget') return buildBudgetSlide(revenueData);
  if (type === 'monthly') return buildMonthlySlide(revenueData);
  if (type === 'accounts') return buildAccountsSlide(revenueData);
  return buildYtdSlide(revenueData);
}

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

  if (item.type === 'dashboard') {
    requestAnimationFrame(() => {
      fitSlide(el);
      setTimeout(() => fitSlide(el), 80);
    });
  }

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

refreshAll();

document.addEventListener('click', () => {
  fullscreenHint.classList.add('hidden');
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

setTimeout(() => fullscreenHint.classList.add('hidden'), 6000);

window.addEventListener('resize', () => {
  if (!currentEl?.classList?.contains('rev-slide')) return;
  fitSlide(currentEl);
});
