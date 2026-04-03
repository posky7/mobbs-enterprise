import { readBlobData, writeBlobData } from './_blob-storage.mjs';

// Helper functions for loan calculations
function loanPaid(loan) {
  return (loan.payments || []).reduce((s, p) => s + Number(p.amount), 0);
}

function loanBalance(loan) {
  return Math.max(0, Number(loan.amount) - loanPaid(loan));
}

/**
 * @param {Request} req
 * @param {import("@netlify/functions").Context} [context]
 */
export default async function handler(req, context) {
  const httpMethod = req.method;
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const loanId = url.searchParams.get('loanId');
  const paymentId = url.searchParams.get('paymentId');

  try {
    if (httpMethod === 'GET') {
      const loans = await readBlobData('loans');
      return new Response(JSON.stringify(loans), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'PUT') {
      /** @type {any[]} */
      const loansData = await req.json().catch(() => []);
      await writeBlobData('loans', loansData);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'POST' && action === 'add-payment') {
      /** @type {{ loanId?: string, date?: string, amount?: any, note?: string }} */
      const { loanId: bodyLoanId, date, amount, note } = await req.json().catch(() => ({}));
      const resolvedLoanId = bodyLoanId || loanId;

      if (!resolvedLoanId || !amount || amount <= 0) {
        return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const loans = await readBlobData('loans');
      const loan = loans.find(l => l.id === resolvedLoanId);

      if (!loan) {
        return new Response(JSON.stringify({ error: 'Loan not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const remaining = loanBalance(loan);
      const actualAmount = Math.min(Number(amount), remaining);

      if (!loan.payments) loan.payments = [];
      loan.payments.push({
        pid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: date || new Date().toISOString().split('T')[0],
        amount: actualAmount,
        note: note || 'Payment'
      });

      if (loanBalance(loan) === 0) {
        loan.status = 'Paid Off';
      }

      await writeBlobData('loans', loans);
      return new Response(JSON.stringify({
        success: true,
        message: `Payment of $${actualAmount.toFixed(2)} recorded`,
        capped: actualAmount < Number(amount)
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'DELETE' && action === 'remove-payment') {
      if (!loanId || !paymentId) {
        return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const loans = await readBlobData('loans');
      const loan = loans.find(l => l.id === loanId);

      if (!loan) {
        return new Response(JSON.stringify({ error: 'Loan not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      loan.payments = (loan.payments || []).filter(p => p.pid !== paymentId);

      if (loanBalance(loan) > 0 && loan.status === 'Paid Off') {
        loan.status = 'Active';
      }

      await writeBlobData('loans', loans);
      return new Response(JSON.stringify({ success: true, message: 'Payment removed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Loans API error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}