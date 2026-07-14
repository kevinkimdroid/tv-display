const fs = require('fs');
const path = require('path');

const MONTH_ORDER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SEGMENT_ORDER = ['Group', 'Individual', 'Investments', 'Pension'];

const FAIL_PCT = 80;
const RISK_PCT = 95;

const ACCOUNT_META = {
  '400001': { shortName: 'Investments', segment: 'Investments' },
  '400002': { shortName: 'Ind. Term', segment: 'Individual' },
  '400003': { shortName: 'Ind. Endowment', segment: 'Individual' },
  '400004': { shortName: 'Ind. Whole Life', segment: 'Individual' },
  '401001': { shortName: 'Group Life', segment: 'Group' },
  '401002': { shortName: 'Credit Life', segment: 'Group' },
  '401003': { shortName: 'Mortgages', segment: 'Group' },
  '401004': { shortName: 'Staff Pension', segment: 'Pension' },
  '401005': { shortName: 'Umbrella', segment: 'Pension' },
  '401008': { shortName: 'Ind. Pension', segment: 'Pension' },
  '401009': { shortName: 'GL Combined', segment: 'Group' },
  '401010': { shortName: 'GL Last Expense', segment: 'Group' }
};

function loadBudgetFile(year) {
  const file = path.join(__dirname, '..', 'data', `budgets-${year}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

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

function allocateBudgetsToAccounts(fileLines, monthlyByAccount, periods, closed) {
  const budgetByCode = {};
  const annualByCode = {};

  for (const line of fileLines) {
    if (!(line.annual > 0)) continue;
    const codes = line.accounts || [];
    if (!codes.length) continue;
    const budgetYtd = sumMonths(line.months, closed);
    const actuals = codes.map((code) => actualForAccounts(monthlyByAccount, [code], periods));
    const totalAct = actuals.reduce((s, v) => s + v, 0);
    codes.forEach((code, i) => {
      const share = totalAct > 0 ? actuals[i] / totalAct : 1 / codes.length;
      budgetByCode[code] = (budgetByCode[code] || 0) + budgetYtd * share;
      annualByCode[code] = (annualByCode[code] || 0) + line.annual * share;
    });
  }

  return { budgetByCode, annualByCode };
}

function buildGlProductRows(glAccounts, fileLines, monthlyByAccount, periods, closed) {
  const { budgetByCode, annualByCode } = allocateBudgetsToAccounts(
    fileLines, monthlyByAccount, periods, closed
  );

  return glAccounts.map((acc) => {
    const code = acc.code;
    const meta = ACCOUNT_META[code] || {};
    const actualYtd = actualForAccounts(monthlyByAccount, [code], periods);
    const budgetYtd = budgetByCode[code] || 0;
    const annualBudget = annualByCode[code] || 0;
    const variance = actualYtd - budgetYtd;
    const hasBudget = budgetYtd > 0;
    const pct = hasBudget ? Number(((actualYtd / budgetYtd) * 100).toFixed(1)) : null;
    const annualPct = annualBudget > 0
      ? Number(((actualYtd / annualBudget) * 100).toFixed(1))
      : null;
    return {
      id: code,
      code,
      name: acc.name,
      shortName: meta.shortName || acc.name,
      segment: meta.segment || 'Other',
      accounts: [code],
      annualBudget,
      budgetYtd,
      actualYtd,
      variance,
      pctOfBudget: pct,
      pctOfAnnual: annualPct,
      status: hasBudget ? statusFromPct(pct) : 'untracked'
    };
  });
}

function buildBudgetComparison(year, monthlyByAccount, oracleMonthly = {}, glAccounts = []) {
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
      products: [],
      segments: [],
      failing: [],
      atRisk: [],
      onTrackCount: 0,
      summary: null,
      direction: null,
      chart: []
    };
  }

  const products = buildGlProductRows(
    glAccounts.length
      ? glAccounts
      : Object.keys(ACCOUNT_META).map((code) => ({ code, name: ACCOUNT_META[code].shortName })),
    file.lines,
    monthlyByAccount,
    periods,
    closed
  );

  const budgetedProducts = products.filter((l) => l.budgetYtd > 0);
  const byWorst = [...budgetedProducts].sort((a, b) => (a.pctOfBudget ?? 999) - (b.pctOfBudget ?? 999));
  const failing = byWorst.filter((l) => l.status === 'failing');
  const atRisk = byWorst.filter((l) => l.status === 'at_risk');
  const onTrack = byWorst.filter((l) => l.status === 'on_track');

  const oracleActualYtd = periods.reduce(
    (sum, p) => sum + (Number(oracleMonthly[p]) || 0),
    0
  );
  const overallBudgetYtd = file.overall
    ? sumMonths(file.overall.months, closed)
    : budgetedProducts.reduce((s, l) => s + l.budgetYtd, 0);
  const overallVariance = oracleActualYtd - overallBudgetYtd;
  const overallPct = overallBudgetYtd > 0
    ? Number(((oracleActualYtd / overallBudgetYtd) * 100).toFixed(1))
    : null;
  const productRollup = rollupLines(budgetedProducts);

  const summary = {
    budgetYtd: overallBudgetYtd,
    actualYtd: oracleActualYtd,
    variance: overallVariance,
    pctOfBudget: overallPct,
    status: statusFromPct(overallPct),
    failingCount: failing.length,
    atRiskCount: atRisk.length,
    onTrackCount: onTrack.length,
    lineCount: products.length,
    budgetLabel: file.overall?.name || 'Overall budget',
    actualLabel: 'Oracle posted (all accounts)',
    productBudgetYtd: productRollup.budgetYtd,
    productActualYtd: productRollup.actualYtd
  };

  const segments = SEGMENT_ORDER
    .map((name) => {
      const segLines = products.filter((l) => l.segment === name);
      if (!segLines.length) return null;
      const rollup = rollupLines(segLines.filter((l) => l.budgetYtd > 0));
      return {
        name,
        lines: segLines.sort((a, b) => b.actualYtd - a.actualYtd),
        ...rollup,
        lineCount: segLines.length
      };
    })
    .filter(Boolean);

  const chart = [...products]
    .sort((a, b) => Math.max(b.budgetYtd, b.actualYtd) - Math.max(a.budgetYtd, a.actualYtd))
    .map((l) => ({
      id: l.id,
      code: l.code,
      name: l.shortName || l.name,
      fullName: l.name,
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
    products,
    allLines: products,
    segments,
    chart,
    failing,
    atRisk,
    onTrackCount: onTrack.length,
    summary,
    direction: buildDirection(budgetedProducts, summary, segments)
  };
}

module.exports = { buildBudgetComparison, loadBudgetFile, ACCOUNT_META };
