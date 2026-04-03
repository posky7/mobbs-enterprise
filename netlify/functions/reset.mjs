import { clearBlobStore, setBackupTimestamp } from './_blob-storage.mjs';

/**
 * @param {Request} req
 * @param {import("@netlify/functions").Context} [context]
 */
export default async function handler(req, context) {
  const httpMethod = req.method;

  if (httpMethod !== 'POST' && httpMethod !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    console.log('Reset function called - clearing all data stores');

    await clearBlobStore('inventory');
    await clearBlobStore('locations');
    await clearBlobStore('expenses');
    await clearBlobStore('loans');

    await setBackupTimestamp(null);

    return new Response(JSON.stringify({
      success: true,
      message: 'All data has been reset successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Reset function error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to reset data',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}