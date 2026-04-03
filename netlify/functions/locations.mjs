import { readBlobData, writeBlobData } from './_blob-storage.mjs';

/**
 * @param {Request} req
 * @param {import("@netlify/functions").Context} [context]
 */
export default async function handler(req, context) {
  const httpMethod = req.method;

  try {
    if (httpMethod === 'GET') {
      const locations = await readBlobData('locations');
      return new Response(JSON.stringify(locations), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'PUT') {
      /** @type {any[]} */
      const locationsData = await req.json().catch(() => []);
      await writeBlobData('locations', locationsData);
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
    console.error('Locations API error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}