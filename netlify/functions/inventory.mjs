import { readBlobData, writeBlobData } from './_blob-storage.mjs';

const MIGRATION_VERSION = 1;

function migrateItem(item) {
  if (!item.version) {
    item.version = MIGRATION_VERSION;
    if (typeof item.quantity === 'undefined') item.quantity = 0;
    if (typeof item.price === 'undefined') item.price = 0;
  }
  return item;
}

export default async function handler(event) {
  const httpMethod = event.httpMethod || 'GET';

  try {
    if (httpMethod === 'GET') {
      let inventory = await readBlobData('inventory');
      inventory = inventory.map(migrateItem);
      await writeBlobData('inventory', inventory);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inventory)
      };
    }

    if (httpMethod === 'PUT' || httpMethod === 'POST') {
      const data = JSON.parse(event.body || '[]');
      const migrated = Array.isArray(data) ? data.map(migrateItem) : data;
      await writeBlobData('inventory', migrated);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    if (httpMethod === 'DELETE') {
      await writeBlobData('inventory', []);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    // Transfer action (used by Move Inventory)
    if (httpMethod === 'POST' && event.queryStringParameters?.action === 'transfer') {
      const { itemId, fromLocation, toLocation, quantity } = JSON.parse(event.body || '{}');

      if (!itemId || !fromLocation || !toLocation || !quantity) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing parameters' })
        };
      }

      let inventory = await readBlobData('inventory');
      const item = inventory.find(i => i.id === itemId);
      if (!item) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Item not found' })
        };
      }

      if (!item.inventory) item.inventory = {};
      const fromQty = Number(item.inventory[fromLocation]?.qty || 0);
      if (fromQty < quantity) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Insufficient quantity' })
        };
      }

      item.inventory[fromLocation] = { qty: fromQty - quantity, lastUpdated: new Date().toISOString() };
      if (!item.inventory[toLocation]) item.inventory[toLocation] = { qty: 0 };
      item.inventory[toLocation].qty += quantity;
      item.inventory[toLocation].lastUpdated = new Date().toISOString();

      await writeBlobData('inventory', inventory);

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
    console.error('Inventory handler error:', error);
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