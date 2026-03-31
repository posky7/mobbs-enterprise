import { readBlobData, writeBlobData } from './_blob-storage.mjs';

// Helper functions for loan calculations
function loanPaid(loan) {
  return (loan.payments||[]).reduce((s,p)=>s+Number(p.amount),0);
}

function loanBalance(loan) {
  return Math.max(0, Number(loan.amount)-loanPaid(loan));
}

export default async function handler(event, context) {
  const { httpMethod, body, queryStringParameters } = event;

  try {
    if (httpMethod === 'GET') {
      const loans = await readBlobData('loans');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loans)
      };
    }

    if (httpMethod === 'PUT') {
      const loans = JSON.parse(body || '[]');
      await writeBlobData('loans', loans);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    if (httpMethod === 'POST' && queryStringParameters?.action === 'add-payment') {
      const { loanId, date, amount, note } = JSON.parse(body || '{}');

      if (!loanId || !amount || amount <= 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required parameters' })
        };
      }

      const loans = await readBlobData('loans');
      const loan = loans.find(l => l.id === loanId);

      if (!loan) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Loan not found' })
        };
      }

      // Cap payment at remaining balance
      const remaining = loanBalance(loan);
      const actualAmount = Math.min(Number(amount), remaining);

      if (!loan.payments) loan.payments = [];
      loan.payments.push({
        pid: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        date: date || new Date().toISOString().split('T')[0],
        amount: actualAmount,
        note: note || 'Payment'
      });

      // Mark as paid off if balance is zero
      if (loanBalance(loan) === 0) {
        loan.status = 'Paid Off';
      }

      await writeBlobData('loans', loans);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: `Payment of $${actualAmount.toFixed(2)} recorded`,
          capped: actualAmount < Number(amount)
        })
      };
    }

    if (httpMethod === 'DELETE' && queryStringParameters?.action === 'remove-payment') {
      const { loanId, paymentId } = queryStringParameters;

      if (!loanId || !paymentId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required parameters' })
        };
      }

      const loans = await readBlobData('loans');
      const loan = loans.find(l => l.id === loanId);

      if (!loan) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Loan not found' })
        };
      }

      loan.payments = (loan.payments || []).filter(p => p.pid !== paymentId);

      // Update status if no longer paid off
      if (loanBalance(loan) > 0 && loan.status === 'Paid Off') {
        loan.status = 'Active';
      }

      await writeBlobData('loans', loans);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Payment removed' })
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Loans API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
