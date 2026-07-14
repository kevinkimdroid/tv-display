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
  portfolio: 'PORTFOLIO DIRECTION',
  budget: 'ACTUAL VS BUDGET',
  monthly: 'MONTHLY PREMIUM TREND',
  accounts: 'ACCOUNT BREAKDOWN',
  image: 'MEDIA',
  video: 'MEDIA'
};

function formatMoney(n) { return fmt.format(Math.round(n)); }

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

function formatMoneyValue(n) {
  const formatted = fmt.format(Math.round(n)).replace(/\u00a0/g, ' ');
  const spaceIdx = formatted.indexOf(' ');
  return spaceIdx === -1 ? formatted : formatted.slice(spaceIdx + 1);
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
  const wrap = el.closest('.rev-index-amount-wrap') || el.parentElement;
  const measureEl = el.querySelector('.money') || el;
  if (!wrap) return;
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  const minSize = 22;
  while (measureEl.scrollWidth > wrap.clientWidth - 8 && size > minSize) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

function fitTvTables(root) {
  const slide = root || currentEl;
  if (!slide?.classList?.contains('rev-slide')) return;
  const body = slide.querySelector('.rev-table-body');
  if (!body) return;
  const rows = body.querySelectorAll('.rev-row');
  if (!rows.length) return;

  const bodyH = body.clientHeight;
  if (bodyH < 20) {
    requestAnimationFrame(() => fitTvTables(slide));
    return;
  }

  const rowH = Math.max(40, Math.floor(bodyH / rows.length));
  const fontPx = Math.min(15, Math.max(11, Math.round(rowH * 0.32)));
  const rankSize = Math.min(28, Math.max(22, Math.round(rowH * 0.45)));

  rows.forEach((row) => {
    row.style.height = rowH + 'px';
    row.style.minHeight = rowH + 'px';
    row.style.maxHeight = 'none';
    row.style.fontSize = fontPx + 'px';
    const pad = Math.max(6, Math.floor((rowH - fontPx) / 2));
    row.style.paddingTop = pad + 'px';
    row.style.paddingBottom = pad + 'px';
    const rank = row.querySelector('.rev-rank');
    if (rank) {
      rank.style.width = rankSize + 'px';
      rank.style.height = rankSize + 'px';
      rank.style.fontSize = Math.max(10, fontPx - 1) + 'px';
    }
    const bar = row.querySelector('.rev-share-bar');
    if (bar) bar.style.width = bar.dataset.pct + '%';
  });

  const amount = slide.querySelector('.rev-index-amount');
  if (amount) fitAmountFont(amount);
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
  requestAnimationFrame(() => fitTvTables(newEl));
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
  el.className = 'rev-slide rev-panel';
  const b = data.budget;
  if (!b?.segments?.length) {
    el.innerHTML = `
      ${panelHeader('PORTFOLIO', 'Portfolio Direction', 'All products · budget pace', data.year)}
      <div class="rev-loading">Budget mapping unavailable</div>`;
    return el;
  }

  const s = b.summary;
  const d = b.direction || {};
  const paceCls = statusClass(s.status);
  const milCls = s.status === 'failing' ? 'fail' : (s.status === 'at_risk' ? 'amber' : 'green');

  el.innerHTML = `
    ${panelHeader('PORTFOLIO', 'Portfolio Direction', 'All products at a glance · YTD ' + b.throughLabel, data.year)}
    <div class="rev-portfolio-body">
      <div class="rev-direction-banner ${paceCls}">
        <div class="rev-direction-main">
          <div class="rev-direction-kicker">Organisation direction</div>
          <div class="rev-direction-headline">${d.headline || 'Budget performance'}</div>
          <div class="rev-direction-sub">${d.narrative || ''}</div>
        </div>
        <div class="rev-direction-pace">
          <div class="rev-direction-pace-val ${paceCls}">${s.pctOfBudget != null ? s.pctOfBudget + '%' : '—'}</div>
          <div class="rev-direction-pace-lbl">of YTD budget</div>
          <div class="rev-direction-gap ${s.variance >= 0 ? 'ok' : 'fail'}">
            ${s.variance >= 0 ? 'Ahead' : 'Short'} ${compactMoney(Math.abs(s.variance))}
          </div>
        </div>
      </div>

      <div class="rev-portfolio-grid">
        ${b.segments.map((seg) => `
          <section class="rev-seg ${statusClass(seg.status)}">
            <header class="rev-seg-head">
              <div>
                <div class="rev-seg-name">${seg.name}</div>
                <div class="rev-seg-meta">${seg.lineCount} product${seg.lineCount === 1 ? '' : 's'}</div>
              </div>
              <div class="rev-seg-pace ${statusClass(seg.status)}">
                ${seg.pctOfBudget != null ? seg.pctOfBudget + '%' : '—'}
              </div>
            </header>
            <div class="rev-seg-totals">
              <span>Actual ${compactMoney(seg.actualYtd)}</span>
              <span>Budget ${compactMoney(seg.budgetYtd)}</span>
            </div>
            <div class="rev-product-list">
              ${seg.lines.map((line) => {
                const barPct = Math.min(line.pctOfBudget != null ? line.pctOfBudget : (line.pctOfAnnual || 0), 120);
                const isDeficit = line.annualBudget > 0 && line.variance < 0;
                const gapBit = line.annualBudget > 0
                  ? (isDeficit
                    ? `<span class="rev-product-def fail">−${compactMoney(Math.abs(line.variance))}</span>`
                    : `<span class="rev-product-def ok">+${compactMoney(line.variance)}</span>`)
                  : `<span class="rev-product-def plain">no budget</span>`;
                return `
                  <div class="rev-product ${statusClass(line.status)}">
                    <div class="rev-product-top">
                      <span class="rev-product-name">${line.shortName || line.name}</span>
                      <span class="rev-product-badge ${statusClass(line.status)}">${statusLabel(line.status)}</span>
                    </div>
                    <div class="rev-product-trio">
                      <span><em>Bud</em> ${compactMoney(line.budgetYtd)}</span>
                      <span><em>Act</em> ${compactMoney(line.actualYtd)}</span>
                      ${gapBit}
                    </div>
                    <div class="rev-product-bar-track">
                      <div class="rev-product-bar ${statusClass(line.status)}" style="width:${Math.max(barPct, 2)}%"></div>
                      <div class="rev-product-bar-mark"></div>
                    </div>
                    <div class="rev-product-foot">
                      <span class="rev-product-amt">${moneyHtml(line.actualYtd, { sm: true })}</span>
                      <span class="rev-product-pct ${statusClass(line.status)}">${line.pctOfBudget != null ? line.pctOfBudget + '%' : '—'}</span>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </section>
        `).join('')}
      </div>

      <div class="rev-portfolio-legend">
        <span class="rev-flag ok">${b.onTrackCount} on track</span>
        <span class="rev-flag risk">${s.atRiskCount} at risk</span>
        <span class="rev-flag fail">${s.failingCount} behind</span>
        <span class="rev-legend-note">100% mark = YTD budget · Book5 vs Oracle posted</span>
      </div>
    </div>`;

  return el;
}

function buildBudgetSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel';
  const b = data.budget;
  if (!b?.lines?.length) {
    el.innerHTML = `
      ${panelHeader('BUDGET', 'Budget vs Actual', 'No budget file loaded for ' + data.year, data.year)}
      <div class="rev-loading">Add data/budgets-${data.year}.json to enable comparisons</div>`;
    return el;
  }

  const s = b.summary;
  const chart = b.chart || b.lines;
  const totalDeficit = b.lines
    .filter((l) => l.variance < 0)
    .reduce((sum, l) => sum + Math.abs(l.variance), 0);
  const totalSurplus = b.lines
    .filter((l) => l.variance > 0)
    .reduce((sum, l) => sum + l.variance, 0);
  const scaleMax = Math.max(...chart.map((l) => Math.max(l.budgetYtd, l.actualYtd)), s.budgetYtd, s.actualYtd, 1);
  const headline = s.variance < 0
    ? `Short of Overall Life budget by ${formatMoney(Math.abs(s.variance))}`
    : `Ahead of Overall Life budget by ${formatMoney(s.variance)}`;

  // SVG clustered column chart — Budget (silver) vs Actual (cyan/red)
  const W = 1000;
  const H = 260;
  const padL = 54;
  const padR = 16;
  const padT = 28;
  const padB = 48;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = chart.length;
  const groupW = plotW / Math.max(n, 1);
  const barW = Math.min(28, groupW * 0.32);
  const yMax = scaleMax * 1.08;
  const y = (v) => padT + plotH - (v / yMax) * plotH;
  const gridVals = [0.25, 0.5, 0.75, 1].map((p) => yMax * p);
  const chartSvg = `
    <svg class="rev-vs-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Budget versus actual by product">
      ${gridVals.map((gv) => `
        <line class="rev-vs-grid" x1="${padL}" y1="${y(gv)}" x2="${W - padR}" y2="${y(gv)}" />
        <text class="rev-vs-axis" x="${padL - 8}" y="${y(gv) + 4}" text-anchor="end">${compactMoney(gv)}</text>
      `).join('')}
      <line class="rev-vs-axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" />
      <line class="rev-vs-axis-line" x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" />
      ${chart.map((line, i) => {
        const cx = padL + groupW * i + groupW / 2;
        const bh = Math.max(padT + plotH - y(line.budgetYtd), 2);
        const ah = Math.max(padT + plotH - y(line.actualYtd), 2);
        const isDef = line.variance < 0;
        const actualClass = isDef ? 'fail' : 'ok';
        return `
          <g class="rev-vs-col-group">
            <rect class="rev-vs-col budget" x="${cx - barW - 3}" y="${y(line.budgetYtd)}" width="${barW}" height="${bh}" rx="3" />
            <rect class="rev-vs-col actual ${actualClass}" x="${cx + 3}" y="${y(line.actualYtd)}" width="${barW}" height="${ah}" rx="3" />
            <text class="rev-vs-col-lbl" x="${cx}" y="${H - 28}" text-anchor="middle">${line.name}</text>
            <text class="rev-vs-col-pct ${actualClass}" x="${cx}" y="${H - 12}" text-anchor="middle">${line.pctOfBudget != null ? line.pctOfBudget + '%' : ''}</text>
          </g>`;
      }).join('')}
    </svg>`;

  el.innerHTML = `
    ${panelHeader('BUDGET', 'Actual vs Budget', 'YTD ' + b.throughLabel + ' · full Oracle posted vs Book5 Overall Life', data.year)}
    <div class="rev-budget-body vs-body">
      <div class="rev-vs-hero">
        <div class="rev-vs-compare-card">
          <div class="rev-vs-pair">
            <div class="rev-vs-col budget-col">
              <div class="rev-vs-tag">BUDGET</div>
              <div class="rev-vs-big">${moneyHtml(s.budgetYtd)}</div>
              <div class="rev-vs-hint">${s.budgetLabel || 'Overall Life'} · YTD ${b.throughLabel}</div>
            </div>
            <div class="rev-vs-divider" aria-hidden="true"><span>vs</span></div>
            <div class="rev-vs-col actual-col">
              <div class="rev-vs-tag accent">ACTUAL</div>
              <div class="rev-vs-big accent">${moneyHtml(s.actualYtd)}</div>
              <div class="rev-vs-hint">${s.actualLabel || 'Oracle posted'} · YTD ${b.throughLabel}</div>
            </div>
          </div>
          <div class="rev-vs-track">
            <div class="rev-vs-track-actual ${statusClass(s.status)}" style="width:${Math.min((s.actualYtd / Math.max(s.budgetYtd, 1)) * 100, 100)}%"></div>
            <div class="rev-vs-track-label">${s.pctOfBudget}% of Overall Life budget</div>
          </div>
          <div class="rev-vs-live">Live YTD incl. current month: <strong>${formatMoney(data.ytdTotal)}</strong></div>
        </div>

        <div class="rev-vs-side">
          <div class="rev-vs-deficit-card ${s.variance < 0 ? 'is-deficit' : 'is-surplus'}">
            <div class="rev-vs-tag">${s.variance < 0 ? 'NET DEFICIT' : 'NET SURPLUS'}</div>
            <div class="rev-vs-big ${s.variance < 0 ? 'fail' : 'ok'}">${moneyHtml(Math.abs(s.variance))}</div>
            <div class="rev-vs-hint">${headline}</div>
          </div>
          <div class="rev-vs-mini-grid">
            <div class="rev-vs-mini fail">
              <div class="rev-vs-mini-lbl">Product deficits</div>
              <div class="rev-vs-mini-val">${compactMoney(totalDeficit)}</div>
            </div>
            <div class="rev-vs-mini ok">
              <div class="rev-vs-mini-lbl">Product surplus</div>
              <div class="rev-vs-mini-val">${compactMoney(totalSurplus)}</div>
            </div>
            <div class="rev-vs-mini">
              <div class="rev-vs-mini-lbl">Behind</div>
              <div class="rev-vs-mini-val fail">${s.failingCount}</div>
            </div>
            <div class="rev-vs-mini">
              <div class="rev-vs-mini-lbl">At risk</div>
              <div class="rev-vs-mini-val risk">${s.atRiskCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="rev-vs-chart-wrap">
        <div class="rev-vs-chart-head">
          <div class="rev-section-head" style="margin:0">Product graph — Budget vs Actual</div>
          <div class="rev-vs-legend">
            <span class="rev-vs-leg budget"><i></i>Budget</span>
            <span class="rev-vs-leg actual"><i></i>Actual</span>
            <span class="rev-vs-leg fail"><i></i>Behind plan</span>
          </div>
        </div>
        ${chartSvg}
      </div>

      <div class="rev-vs-list compact">
        ${chart.map((line) => {
          const isDeficit = line.variance < 0;
          return `
            <div class="rev-vs-chip ${statusClass(line.status)}">
              <span class="rev-vs-chip-name">${line.name}</span>
              <span class="rev-vs-chip-pair"><em>B</em>${compactMoney(line.budgetYtd)}</span>
              <span class="rev-vs-chip-pair accent"><em>A</em>${compactMoney(line.actualYtd)}</span>
              <span class="rev-vs-chip-gap ${isDeficit ? 'fail' : 'ok'}">${isDeficit ? '−' : '+'}${compactMoney(Math.abs(line.variance))}</span>
              <span class="rev-vs-chip-pct ${statusClass(line.status)}">${line.pctOfBudget != null ? line.pctOfBudget + '%' : '—'}</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  return el;
}

function buildYtdSlide(data) {
  const el = document.createElement('div');
  el.className = 'rev-slide rev-panel';
  const latest = data.monthly[data.monthly.length - 1];
  const latestGrowth = latest?.growth;
  const chgClass = latestGrowth == null ? 'up' : (latestGrowth >= 0 ? 'up' : 'down');
  const chgText = latestGrowth == null
    ? 'Live from Oracle ERP'
    : `${latestGrowth >= 0 ? '+' : '−'}${Math.abs(latestGrowth)}% month on month`;
  const milestone = getMilestone(data.ytdTotal);
  const top = data.topAccounts[0];
  const budgetSummary = data.budget?.summary;
  const budgetInsight = budgetSummary ? `
          <div class="rev-insight ${budgetSummary.status === 'failing' ? 'fail-bg' : ''}">
            <div class="rev-insight-label">Budget Pace (${data.budget.throughLabel})</div>
            <div class="rev-insight-val ${budgetSummary.variance >= 0 ? 'up' : 'down'}">${budgetSummary.pctOfBudget}% of YTD budget</div>
            <div class="rev-insight-name">${budgetSummary.failingCount} behind · ${budgetSummary.atRiskCount} at risk</div>
          </div>` : '';

  el.innerHTML = `
    ${panelHeader('YTD', 'Year-to-Date Premium Summary', 'Posted premium · ' + data.year, data.year)}
    <div class="rev-index-body">
      ${milestone ? `<div class="rev-milestone ${milestone.cls}">${milestone.text}</div>` : ''}

      <div class="rev-hero-row">
        <div class="rev-hero-card">
          <div class="rev-index-label">Total Premium Collected</div>
          <div class="rev-index-amount-wrap">
            <div class="rev-index-amount">${moneyHtml(0, { hero: true })}</div>
          </div>
          <div class="rev-exact-tag">Exact posted figures · Oracle ERP</div>
        </div>
        <div class="rev-insights">
          <div class="rev-insight">
            <div class="rev-insight-label">Month on Month</div>
            <div class="rev-insight-val ${chgClass}">${chgText}</div>
          </div>
          ${top ? `
          <div class="rev-insight highlight">
            <div class="rev-insight-label">Top Account</div>
            <div class="rev-insight-name">${top.name}</div>
            <div class="rev-insight-amt">${moneyHtml(top.amount, { sm: true })}</div>
          </div>` : ''}
          ${budgetInsight}
          <div class="rev-insight">
            <div class="rev-insight-label">Portfolio</div>
            <div class="rev-insight-val num">${data.accountCount} accounts · ${data.monthCount} periods</div>
          </div>
        </div>
      </div>

      <div class="rev-section-head">All Products by Premium · ${data.accountCount} accounts</div>
      <div class="rev-index-table-row">
        <div class="rev-table-head">
          <span>#</span><span>Product Name</span><span class="col-money">Premium Amount</span><span>Share</span>
        </div>
        <div class="rev-table-body">
          ${[...data.accounts].sort((a, b) => b.amount - a.amount).map((a, i) => {
            const pct = data.ytdTotal > 0 ? ((a.amount / data.ytdTotal) * 100).toFixed(1) : '0.0';
            const rank = i + 1;
            return `
              <div class="rev-row${i === 0 ? ' top-row' : ''}">
                <span class="rev-rank">${rank}</span>
                <span class="rev-name" title="${a.name}"><span class="rev-code">${a.code}</span>${a.name}</span>
                <span class="rev-price col-money">${moneyHtml(a.amount)}</span>
                <span class="rev-chg up">${pct}%</span>
                <div class="rev-share-bar" data-pct="${pct}"></div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    animateCount(el.querySelector('.rev-index-amount'), data.ytdTotal);
    fitTvTables(el);
    setTimeout(() => fitTvTables(el), 100);
    setTimeout(() => fitTvTables(el), 2200);
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
    requestAnimationFrame(() => fitTvTables(el));
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
  if (currentEl?.classList?.contains('rev-slide')) fitTvTables(currentEl);
});
