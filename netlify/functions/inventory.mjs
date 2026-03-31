import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_FILE = join(process.cwd(), 'data', 'inventory.json');

// Ensure data directory exists
import { mkdirSync } from 'fs';
try {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
} catch (e) {}

// Helper to read inventory
function readInventory() {
  try {
    const data = readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data) || [];
  } catch (e) {
    return [];
  }
}

// Helper to write inventory
function writeInventory(inventory) {
  writeFileSync(DATA_FILE, JSON.stringify(inventory, null, 2));
}

// Migration helper: convert old single-qty items to multi-location format
function migrateItem(item) {
  if (item.inventory) return item; // Already migrated

  // Create inventory object with default location
  const migrated = { ...item };
  migrated.inventory = {
    'storage': {
      qty: item.qty || 0,
      lastUpdated: new Date().toISOString()
    }
  };
  delete migrated.qty; // Remove old qty field
  return migrated;
}

export default async function handler(event, context) {
  const { httpMethod, body } = event;

  try {
    if (httpMethod === 'GET') {
      let inventory = readInventory();

      // Migrate any old-format items on read
      inventory = inventory.map(migrateItem);
      writeInventory(inventory); // Save migrated data

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inventory)
      };
    }

    if (httpMethod === 'PUT') {
      const inventory = JSON.parse(body || '[]');
      writeInventory(inventory);
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
    console.error('Inventory API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}
