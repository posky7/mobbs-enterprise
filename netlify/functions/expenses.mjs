import { readBlobData, writeBlobData } from './_blob-storage.mjs';

export const config = { runtime: 'nodejs' };

// Monthly equivalent for any frequency
function expMonthly(e) {
  if (e.frequency === 'One-Time') return 0;
  const a = Number(e.amount) || 0;
  switch (e.frequency) {
    case 'Weekly':    return a * 52 / 12;
    case 'Monthly':   return a;
    case 'Quarterly': return a / 3;
    case 'Annual':    return a / 12;
    default:          return a;
  }
}

// Generate scheduled occurrence dates
function expOccurrences(e, upTo) {
  if (e.frequency === 'One-Time' || !e.startDate) return [];
  const start  = new Date(e.startDate);
  const end    = upTo ? new Date(upTo) : new Date();
  const payday = Math.max(1, parseInt(e.payday) || 1);
  const dates  = [];

  const clampDay = (y, m, d) => {
    const max = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(d, max));
  };

  if (e.frequency === 'Weekly') {
    let cur = new Date(start);
    while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 7); }
  } else if (e.frequency === 'Monthly') {
    let y = start.getFullYear(), m = start.getMonth();
    while (true) {
      const d = clampDay(y, m, payday);
      if (d > end) break;
      if (d >= start) dates.push(d);
      m++; if (m > 11) { m = 0; y++; }
    }
  } else if (e.frequency === 'Quarterly') {
    let y = start.getFullYear(), m = start.getMonth();
    while (true) {
      const d = clampDay(y, m, payday);
      if (d > end) break;
      if (d >= start) dates.push(d);
      m += 3; while (m > 11) { m -= 12; y++; }
    }
  } else if (e.frequency === 'Annual') {
    const startMonth = start.getMonth();
    let y = start.getFullYear();
    while (true) {
      const d = clampDay(y, startMonth, payday);
      if (d > end) break;
      if (d >= start) dates.push(d);
      y++;
    }
  }
  return dates;
}

// Total cost within a period
function expCostInPeriod(e, bounds) {
  if (e.frequency === 'One-Time') return 0;
  if (e.startDate) {
    const occ = expOccurrences(e, bounds.end).filter(d => d >= bounds.start && d <= bounds.end);
    return occ.length * Number(e.amount || 0);
  }
  const days = Math.max(1, (bounds.end - bounds.start) / 86400000);
  const months = days / 30.44;
  return expMonthly(e) * months;
}

// YTD spend
function expYTD(e) {
  if (e.frequency === 'One-Time') {
    if (!e.due) return 0;
    const d = new Date(e.due);
    return d.getFullYear() === new Date().getFullYear() ? Number(e.amount || 0) : 0;
  }
  const ytdBounds = {
    start: new Date(new Date().getFullYear(), 0, 1),
    end:   new Date()
  };
  return expCostInPeriod(e, ytdBounds);
}

export default async function handler(req) {
  const httpMethod = req.method;

  try {
    if (httpMethod === 'GET') {
      const expenses = await readBlobData('expenses');
      return new Response(JSON.stringify(expenses), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'PUT') {
      const body = await req.text();
      const expensesData = JSON.parse(body || '[]');
      await writeBlobData('expenses', expensesData);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Expenses API error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}