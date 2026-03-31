import { readBlobData, writeBlobData } from './_blob-storage.mjs';

export default async function handler(event, context) {
  const { httpMethod, body } = event;

  try {
    if (httpMethod === 'GET') {
      const data = await readBlobData('backupTimestamp');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };
    }

    if (httpMethod === 'PUT') {
      const timestampData = JSON.parse(body || '{}');
      await writeBlobData('backupTimestamp', timestampData);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    if (httpMethod === 'POST') {
      // Generate and store a new timestamp
      const timestamp = new Date().toISOString();
      const data = { timestamp };
      await writeBlobData('backupTimestamp', data);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Backup timestamp updated',
          timestamp: timestamp,
          success: true
        })
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Backup timestamp API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
