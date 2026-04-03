import { getBackupTimestamp, setBackupTimestamp } from './_blob-storage.mjs';

/**
 * @param {Request} req
 * @param {import("@netlify/functions").Context} [context]
 */
export default async function handler(req, context) {
  const httpMethod = req.method;

  try {
    if (httpMethod === 'GET') {
      const ts = await getBackupTimestamp();
      return new Response(JSON.stringify({ timestamp: ts }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'PUT' || httpMethod === 'POST') {
      /** @type {{ timestamp?: string }} */
      const { timestamp } = await req.json().catch(() => ({}));
      await setBackupTimestamp(timestamp || new Date().toLocaleString());
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
    console.error('Backup timestamp error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
