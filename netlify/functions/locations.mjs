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

    if (httpMethod === 'POST') {
      const newLocation = await req.json().catch(() => null);
      if (!newLocation) {
        return new Response(JSON.stringify({ error: 'Invalid location data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Validate required fields
      if (!newLocation.name || typeof newLocation.name !== 'string') {
        return new Response(JSON.stringify({ error: 'Location name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get existing locations
      const existingLocations = await readBlobData('locations');

      // Check for duplicate names
      const duplicate = existingLocations.find(loc =>
        loc.name.toLowerCase() === newLocation.name.toLowerCase()
      );
      if (duplicate) {
        return new Response(JSON.stringify({ error: 'Location name already exists' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Generate unique ID
      newLocation.id = Date.now().toString();

      // Set default values
      newLocation.active = newLocation.active !== false; // Default to true
      newLocation.type = newLocation.type || 'retail';
      newLocation.monthlyRent = Number(newLocation.monthlyRent) || 0;
      newLocation.transactionFeePercent = Number(newLocation.transactionFeePercent) || 0;
      newLocation.isWarehouse = Boolean(newLocation.isWarehouse);

      // If setting as warehouse, unset any existing warehouse
      if (newLocation.isWarehouse) {
        existingLocations.forEach(loc => loc.isWarehouse = false);
      }

      // Add to locations array
      existingLocations.push(newLocation);

      // Save updated locations
      await writeBlobData('locations', existingLocations);

      return new Response(JSON.stringify({
        success: true,
        location: newLocation
      }), {
        status: 201,
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