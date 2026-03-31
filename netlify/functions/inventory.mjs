import { readBlobData, writeBlobData } from './_blob-storage.mjs';

const MIGRATION_VERSION = 1;

function migrateItem(item) {
  // Add any data migration logic here if needed in the future
  if (!item.version) {
    item.version = MIGRATION_VERSION;
    // Example: add missing fields with defaults
    if (typeof item.quantity === 'undefined') item.quantity = 0;
    if (typeof item.price === 'undefined') item.price = 0;
  }
  return item;
}

export default async function handler(event, context) {
  const httpMethod = event.httpMethod;

  try {
    if (httpMethod === 'GET') {
      let inventory = await readBlobData('inventory');
      
      // Run migration on every load (safe and idempotent)
      inventory = inventory.map(migrateItem);
      
      // Write back migrated data
      await writeBlobData('inventory', inventory);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inventory)
      };
    }

    if (httpMethod === 'PUT' || httpMethod === 'POST') {
      const data = JSON.parse(event.body);
      
      // Optional: run migration on incoming data too
      const migratedData = Array.isArray(data) 
        ? data.map(migrateItem) 
        : data;

      await writeBlobData('inventory', migratedData);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Inventory updated' })
      };
    }

    if (httpMethod === 'DELETE') {
      await writeBlobData('inventory', []);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Inventory cleared' })
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Inventory function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
}