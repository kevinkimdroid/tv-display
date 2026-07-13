require('dotenv').config();
const oracledb = require('oracledb');

const ACCOUNT_NAMES = {
  '400001': 'Investments',
  '400002': 'Individual Life Term Policies',
  '400003': 'Individual Life Endowment Policies',
  '400004': 'Individual Whole Life Policies',
  '401001': 'Group Life Premium',
  '401002': 'Credit Life Premium',
  '401003': 'Mortgages Premium',
  '401004': 'Geminia Staff Retirement Benefits',
  '401005': 'Geminia Umbrella Scheme Premium',
  '401008': 'Individual Pension Plan Premium',
  '401009': 'Group Life Combined Solutions',
  '401010': 'Group Life Last Expense Premium'
};

const ACCOUNT_NUMBERS = Object.keys(ACCOUNT_NAMES);

const MONTH_ORDER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_LABELS = {
  JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April',
  MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August',
  SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December'
};

const BASE_WHERE = `
  BTC_NO = VGL_BTC_NO
  AND VGL_BTC_NO = TGL_VGL_BTC_NO
  AND VGL_NO = TGL_VGL_NO
  AND TGL_CRT_ACC_ORG_CODE = 1
  AND VGL_STATUS = 'POSTED'
  AND TGL_VGL_BTC_PRD_YER_YEAR = :year
  AND TGL_VGL_BTC_PRD_YER_YEAR = TO_CHAR(VGL_DT, 'YYYY')
  AND TGL_CRT_ACC_NUMBER IN (${ACCOUNT_NUMBERS.map((_, i) => `:acc${i}`).join(', ')})
`;

let cache = { data: null, expiresAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

function getConnectConfig() {
  const host = process.env.ERP_HOST;
  const port = process.env.ERP_PORT || '1521';
  const service = process.env.ERP_SERVICE_NAME;
  return {
    user: process.env.ERP_USERNAME,
    password: process.env.ERP_PASSWORD,
    connectString: `${host}:${port}/${service}`
  };
}

function toPositive(amount) {
  return Math.abs(Number(amount) || 0);
}

function formatGrowth(current, previous) {
  if (previous == null || previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

function bindAccounts(binds) {
  ACCOUNT_NUMBERS.forEach((acc, i) => { binds[`acc${i}`] = acc; });
}

async function getConnection() {
  return oracledb.getConnection(getConnectConfig());
}

async function fetchRawData(year) {
  const conn = await getConnection();
  try {
    const accountBinds = { year };
    bindAccounts(accountBinds);

    const accountsResult = await conn.execute(
      `SELECT TGL_CRT_ACC_NUMBER,
              SUM(DECODE(TGL_SIDE, 'D', NVL(TGL_BCAMT, 0), 0)
                - DECODE(TGL_SIDE, 'C', NVL(TGL_BCAMT, 0), 0)) AS AMOUNT
         FROM FMS_TRNGL, FMS_VOUGL, FMS_BATCHES
        WHERE ${BASE_WHERE}
        GROUP BY TGL_CRT_ACC_NUMBER
        ORDER BY TGL_CRT_ACC_NUMBER`,
      accountBinds
    );

    const monthlyResult = await conn.execute(
      `SELECT TGL_VGL_BTC_PRD_PERIOD,
              SUM(DECODE(TGL_SIDE, 'D', NVL(TGL_BCAMT, 0), 0)
                - DECODE(TGL_SIDE, 'C', NVL(TGL_BCAMT, 0), 0)) AS AMOUNT
         FROM FMS_TRNGL, FMS_VOUGL, FMS_BATCHES
        WHERE ${BASE_WHERE}
        GROUP BY TGL_VGL_BTC_PRD_PERIOD`,
      accountBinds
    );

    const monthlyByAccountResult = await conn.execute(
      `SELECT TGL_CRT_ACC_NUMBER,
              TGL_VGL_BTC_PRD_PERIOD,
              SUM(DECODE(TGL_SIDE, 'D', NVL(TGL_BCAMT, 0), 0)
                - DECODE(TGL_SIDE, 'C', NVL(TGL_BCAMT, 0), 0)) AS AMOUNT
         FROM FMS_TRNGL, FMS_VOUGL, FMS_BATCHES
        WHERE ${BASE_WHERE}
        GROUP BY TGL_CRT_ACC_NUMBER, TGL_VGL_BTC_PRD_PERIOD`,
      accountBinds
    );

    return {
      accounts: accountsResult.rows,
      monthly: monthlyResult.rows,
      monthlyByAccount: monthlyByAccountResult.rows
    };
  } finally {
    await conn.close();
  }
}

function buildDashboard(year, raw) {
  const accounts = raw.accounts.map(([code, amount]) => ({
    code,
    name: ACCOUNT_NAMES[code] || 'Unknown Account',
    amount: toPositive(amount)
  }));

  const ytdTotal = accounts.reduce((sum, a) => sum + a.amount, 0);
  const topAccounts = [...accounts].sort((a, b) => b.amount - a.amount).slice(0, 5);

  const monthlyMap = Object.fromEntries(
    raw.monthly.map(([period, amount]) => [period, toPositive(amount)])
  );

  const monthly = MONTH_ORDER
    .filter((p) => monthlyMap[p] != null)
    .map((period, idx, arr) => {
      const amount = monthlyMap[period];
      const prevPeriod = idx > 0 ? arr[idx - 1] : null;
      const previous = prevPeriod ? monthlyMap[prevPeriod] : null;
      return {
        period,
        label: MONTH_LABELS[period],
        shortLabel: period.charAt(0) + period.slice(1).toLowerCase(),
        amount,
        growth: formatGrowth(amount, previous)
      };
    });

  const monthlyByAccount = {};
  raw.monthlyByAccount.forEach(([code, period, amount]) => {
    if (!monthlyByAccount[code]) monthlyByAccount[code] = {};
    monthlyByAccount[code][period] = toPositive(amount);
  });

  return {
    year,
    fetchedAt: new Date().toISOString(),
    ytdTotal,
    accountCount: accounts.length,
    monthCount: monthly.length,
    accounts,
    topAccounts,
    monthly,
    monthlyByAccount
  };
}

async function getDashboard(year) {
  const now = Date.now();
  if (cache.data && cache.year === year && cache.expiresAt > now) {
    return cache.data;
  }

  const raw = await fetchRawData(year);
  const data = buildDashboard(year, raw);
  cache = { data, year, expiresAt: now + CACHE_TTL_MS };
  return data;
}

function clearCache() {
  cache = { data: null, expiresAt: 0 };
}

module.exports = { getDashboard, clearCache, ACCOUNT_NAMES };
