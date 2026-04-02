import { getBackupTimestamp, setBackupTimestamp } from './_blob-storage.mjs';

export const config = { runtime: 'nodejs' };

export default async function handler(req) {
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
      const body = await req.text();
      const { timestamp } = JSON.parse(body || '{}');
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
