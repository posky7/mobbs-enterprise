import { readBlobData, writeBlobData } from './_blob-storage.mjs';

export default async function handler(event) {
  const httpMethod = event.httpMethod;
  const body = event.body;

  try {
    if (httpMethod === 'GET') {
      let locations = await readBlobData('locations');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locations)
      };
    }

    if (httpMethod === 'PUT') {
      const locationsData = JSON.parse(body || '[]');
      await writeBlobData('locations', locationsData);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    // Default for unsupported methods
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Locations API error:', error);
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