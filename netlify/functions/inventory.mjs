import { readBlobData, writeBlobData } from './_blob-storage.mjs';

export const config = { runtime: 'nodejs' };

const MIGRATION_VERSION = 1;

function migrateItem(item) {
  if (!item.version) {
    item.version = MIGRATION_VERSION;
    if (typeof item.quantity === 'undefined') item.quantity = 0;
    if (typeof item.price === 'undefined') item.price = 0;
  }
  return item;
}

export default async function handler(req) {
  const httpMethod = req.method || 'GET';
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    if (httpMethod === 'GET') {
      let inventory = await readBlobData('inventory');
      inventory = inventory.map(migrateItem);
      await writeBlobData('inventory', inventory);
      return new Response(JSON.stringify(inventory), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'PUT') {
      const body = await req.text();
      const data = JSON.parse(body || '[]');
      const migrated = Array.isArray(data) ? data.map(migrateItem) : data;
      await writeBlobData('inventory', migrated);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'DELETE') {
      await writeBlobData('inventory', []);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Transfer action (used by Move Inventory)
    if (httpMethod === 'POST' && action === 'transfer') {
      const body = await req.text();
      const { itemId, fromLocation, toLocation, quantity } = JSON.parse(body || '{}');

      if (!itemId || !fromLocation || !toLocation || !quantity) {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let inventory = await readBlobData('inventory');
      const item = inventory.find(i => i.id === itemId);
      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!item.inventory) item.inventory = {};
      const fromQty = Number(item.inventory[fromLocation]?.qty || 0);
      if (fromQty < quantity) {
        return new Response(JSON.stringify({ error: 'Insufficient quantity' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      item.inventory[fromLocation] = { qty: fromQty - quantity, lastUpdated: new Date().toISOString() };
      if (!item.inventory[toLocation]) item.inventory[toLocation] = { qty: 0 };
      item.inventory[toLocation].qty += quantity;
      item.inventory[toLocation].lastUpdated = new Date().toISOString();

      await writeBlobData('inventory', inventory);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'POST') {
      const body = await req.text();
      const data = JSON.parse(body || '[]');
      const migrated = Array.isArray(data) ? data.map(migrateItem) : data;
      await writeBlobData('inventory', migrated);
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
    console.error('Inventory handler error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}