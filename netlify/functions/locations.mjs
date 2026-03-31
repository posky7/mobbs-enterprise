import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_FILE = join(process.cwd(), 'data', 'locations.json');

// Ensure data directory exists
import { mkdirSync } from 'fs';
try {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
} catch (e) {}

// Helper to read locations
function readLocations() {
  try {
    const data = readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data) || [];
  } catch (e) {
    // Return default locations if file doesn't exist
    return [
      {
        id: 'storage',
        name: 'Storage',
        type: 'storage',
        active: true,
        order: 0
      }
    ];
  }
}

// Helper to write locations
function writeLocations(locations) {
  writeFileSync(DATA_FILE, JSON.stringify(locations, null, 2));
}

export default async function handler(event, context) {
  const { httpMethod, body, queryStringParameters } = event;

  try {
    if (httpMethod === 'GET') {
      const locations = readLocations();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locations)
      };
    }

    if (httpMethod === 'PUT') {
      const locations = JSON.parse(body || '[]');
      writeLocations(locations);
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