const fs = require('fs');
const path = require('path');

const MONTH_ORDER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SEGMENT_ORDER = ['Group', 'Individual', 'Investments', 'Pension'];

const FAIL_PCT = 80;
const RISK_PCT = 95;

function loadBudgetFile(year) {
  const file = path.join(__dirname, '..', 'data', `budgets-${year}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Closed months for YTD variance (excludes in-progress calendar month). */
function closedMonthCount(year) {
  const now = new Date();
  const y = Number(year);
  if (y < now.getFullYear()) return 12;
  if (y > now.getFullYear()) return 0;
  return now.getMonth();
}

function statusFromPct(pct) {
  if (pct == null) return 'untracked';
  if (pct >= RISK_PCT) return 'on_track';
  if (pct >= FAIL_PCT) return 'at_risk';
  return 'failing';
}

function sumMonths(months, count) {
  return (months || []).slice(0, count).reduce((s, v) => s + (Number(v) || 0), 0);
}

function actualForAccounts(monthlyByAccount, accounts, periods) {
  let total = 0;
  for (const code of accounts) {
    const byPeriod = monthlyByAccount[code] || {};
    for (const period of periods) {
      total += Number(byPeriod[period]) || 0;
    }
  }
  return total;
}

function rollupLines(lines) {
  const budgetYtd = lines.reduce((s, l) => s + l.budgetYtd, 0);
  const actualYtd = lines.reduce((s, l) => s + l.actualYtd, 0);
  const variance = actualYtd - budgetYtd;
  const hasBudget = lines.some((l) => l.budgetYtd > 0);
  const pct = hasBudget && budgetYtd > 0
    ? Number(((actualYtd / budgetYtd) * 100).toFixed(1))
    : null;
  return {
    budgetYtd,
    actualYtd,
    variance,
    pctOfBudget: pct,
    status: hasBudget ? statusFromPct(pct) : 'untracked',
    failingCount: lines.filter((l) => l.status === 'failing').length,
    atRiskCount: lines.filter((l) => l.status === 'at_risk').length,
    onTrackCount: lines.filter((l) => l.status === 'on_track').length,
    lineCount: lines.length
  };
}

function buildDirection(lines, summary, segments) {
  const rankedBudgeted = lines
    .filter((l) => l.budgetYtd > 0)
    .sort((a, b) => (a.pctOfBudget ?? 999) - (b.pctOfBudget ?? 999));
  const strongest = [...rankedBudgeted].sort((a, b) => (b.pctOfBudget ?? 0) - (a.pctOfBudget ?? 0))[0];
  const weakest = rankedBudgeted[0];
  const laggingSegs = segments
    .filter((s) => s.status === 'failing' || s.status === 'at_risk')
    .map((s) => s.name);
  const leadingSegs = segments
    .filter((s) => s.status === 'on_track')
    .map((s) => s.name);

  let headline;
  if (summary.status === 'on_track') {
    headline = 'Portfolio on pace against YTD budget';
  } else if (summary.status === 'at_risk') {
    headline = 'Portfolio near plan — selected lines need attention';
  } else {
    headline = 'Portfolio behind YTD budget — recovery focus required';
  }

  const parts = [];
  if (leadingSegs.length) parts.push(`${leadingSegs.join(' & ')} leading`);
  if (laggingSegs.length) parts.push(`${laggingSegs.join(' & ')} behind plan`);
  if (weakest) parts.push(`largest drag: ${weakest.shortName || weakest.name} (${weakest.pctOfBudget}%)`);
  if (strongest && strongest.id !== weakest?.id) {
    parts.push(`strongest: ${strongest.shortName || strongest.name} (${strongest.pctOfBudget}%)`);
  }

  return {
    headline,
    narrative: parts.join(' · '),
    strongest: strongest
      ? { id: strongest.id, name: strongest.name, pctOfBudget: strongest.pctOfBudget, variance: strongest.variance }
      : null,
    weakest: weakest
      ? { id: weakest.id, name: weakest.name, pctOfBudget: weakest.pctOfBudget, variance: weakest.variance }
      : null
  };
}

function buildBudgetComparison(year, monthlyByAccount, oracleMonthly = {}) {
  const file = loadBudgetFile(year);
  if (!file?.lines?.length) return null;

  const closed = closedMonthCount(year);
  const periods = MONTH_ORDER.slice(0, closed);
  const throughLabel = !periods.length
    ? 'No closed months yet'
    : periods.length === 1
      ? periods[0]
      : `${periods[0]}–${periods[periods.length - 1]}`;

  if (!periods.length) {
    return {
      source: file.source,
      year: String(year),
      throughPeriod: null,
      throughLabel,
      lines: [],
      segments: [],
      failing: [],
      atRisk: [],
      onTrackCount: 0,
      summary: null,
      direction: null
    };
  }

  const lines = file.lines.map((line) => {
    const budgetYtd = sumMonths(line.months, closed);
    const actualYtd = actualForAccounts(monthlyByAccount, line.accounts, periods);
    const variance = actualYtd - budgetYtd;
    const hasBudget = line.annual > 0 && budgetYtd > 0;
    const pct = hasBudget ? Number(((actualYtd / budgetYtd) * 100).toFixed(1)) : null;
    const annualPct = line.annual > 0
      ? Number(((actualYtd / line.annual) * 100).toFixed(1))
      : null;
    return {
      id: line.id,
      name: line.name,
      shortName: line.shortName || line.name,
      segment: line.segment || 'Other',
      accounts: line.accounts,
      annualBudget: line.annual,
      budgetYtd,
      actualYtd,
      variance,
      pctOfBudget: pct,
      pctOfAnnual: annualPct,
      status: hasBudget ? statusFromPct(pct) : 'untracked'
    };
  });

  const budgeted = lines.filter((l) => l.annualBudget > 0);
  const byWorst = [...budgeted].sort((a, b) => (a.pctOfBudget ?? 999) - (b.pctOfBudget ?? 999));
  const failing = byWorst.filter((l) => l.status === 'failing');
  const atRisk = byWorst.filter((l) => l.status === 'at_risk');
  const onTrack = byWorst.filter((l) => l.status === 'on_track');

  // True Oracle posted premium for closed months (all GL accounts).
  const oracleActualYtd = periods.reduce(
    (sum, p) => sum + (Number(oracleMonthly[p]) || 0),
    0
  );
  const overallBudgetYtd = file.overall
    ? sumMonths(file.overall.months, closed)
    : budgeted.reduce((s, l) => s + l.budgetYtd, 0);
  const overallVariance = oracleActualYtd - overallBudgetYtd;
  const overallPct = overallBudgetYtd > 0
    ? Number(((oracleActualYtd / overallBudgetYtd) * 100).toFixed(1))
    : null;
  const productRollup = rollupLines(budgeted);

  const summary = {
    budgetYtd: overallBudgetYtd,
    actualYtd: oracleActualYtd,
    variance: overallVariance,
    pctOfBudget: overallPct,
    status: statusFromPct(overallPct),
    failingCount: failing.length,
    atRiskCount: atRisk.length,
    onTrackCount: onTrack.length,
    lineCount: budgeted.length,
    budgetLabel: file.overall?.name || 'Tracked productions',
    actualLabel: 'Oracle posted (all accounts)',
    productBudgetYtd: productRollup.budgetYtd,
    productActualYtd: productRollup.actualYtd
  };

  const segments = SEGMENT_ORDER
    .map((name) => {
      const segLines = lines.filter((l) => l.segment === name);
      if (!segLines.length) return null;
      const rollup = rollupLines(segLines.filter((l) => l.annualBudget > 0));
      return {
        name,
        lines: segLines.sort((a, b) => b.actualYtd - a.actualYtd),
        ...rollup,
        lineCount: segLines.length
      };
    })
    .filter(Boolean);

  // Chart includes every product line (budgeted + untracked with actuals).
  const chart = [...lines]
    .filter((l) => l.annualBudget > 0 || l.actualYtd > 0)
    .sort((a, b) => Math.max(b.budgetYtd, b.actualYtd) - Math.max(a.budgetYtd, a.actualYtd))
    .map((l) => ({
      id: l.id,
      name: l.shortName || l.name,
      budgetYtd: l.budgetYtd,
      actualYtd: l.actualYtd,
      variance: l.variance,
      pctOfBudget: l.pctOfBudget,
      status: l.status
    }));

  return {
    source: file.source,
    year: String(year),
    throughPeriod: periods[periods.length - 1],
    throughLabel,
    closedMonths: closed,
    lines: byWorst,
    allLines: lines,
    segments,
    chart,
    failing,
    atRisk,
    onTrackCount: onTrack.length,
    summary,
    direction: buildDirection(budgeted, summary, segments)
  };
}

module.exports = { buildBudgetComparison, loadBudgetFile };
