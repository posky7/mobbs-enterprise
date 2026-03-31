import { readBlobData, writeBlobData } from './_blob-storage.mjs';

export default async function handler(event, context) {
  const { httpMethod, body, queryStringParameters } = event;

  try {
    if (httpMethod === 'GET') {
      let locations;
      try {
        locations = await readBlobData('locations');
      } catch (readError) {
        console.error('Failed to read locations data:', readError);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Failed to read locations data',
            details: 'Unable to access stored locations. Please try again or contact support if the problem persists.',
            code: 'READ_ERROR'
          })
        };
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locations)
      };
    }

    if (httpMethod === 'PUT') {
      const locations = JSON.parse(body || '[]');
      await writeBlobData('locations', locations);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Locations API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}