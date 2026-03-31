import { getBackupTimestamp, setBackupTimestamp } from './_blob-storage.mjs';

export default async function handler(event) {
  const httpMethod = event.httpMethod;

  try {
    if (httpMethod === 'GET') {
      const ts = await getBackupTimestamp();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: ts })
      };
    }

    if (httpMethod === 'PUT' || httpMethod === 'POST') {
      const { timestamp } = JSON.parse(event.body || '{}');
      await setBackupTimestamp(timestamp || new Date().toLocaleString());
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Backup timestamp error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
}