import { readBlobData, writeBlobData } from './_blob-storage.mjs';

export const config = { runtime: 'nodejs' };

const MIGRATION_VERSION = 1;

function migrateItem(item) {
  if (!item.version) {
    item.version = MIGRATION_VERSION;
    // Initialize inventory object if it doesn't exist
    if (!item.inventory) {
      item.inventory = {};
      // Migrate legacy qty field to inventory structure
      if (typeof item.qty !== 'undefined' && item.qty !== null) {
        // Use default location if no specific location data exists
        const defaultLocation = 'storage'; // fallback location
        item.inventory[defaultLocation] = {
          qty: Number(item.qty) || 0,
          lastUpdated: new Date().toISOString()
        };
      }
    }

    // Remove legacy fields after migration
    if (typeof item.qty !== 'undefined') delete item.qty;
    if (typeof item.quantity !== 'undefined') delete item.quantity;
    if (typeof item.price !== 'undefined') delete item.price;

    // Ensure all inventory entries have valid quantities
    if (item.inventory) {
      Object.keys(item.inventory).forEach(locId => {
        if (item.inventory[locId] && (item.inventory[locId].qty === null || typeof item.inventory[locId].qty === 'undefined')) {
          item.inventory[locId].qty = 0;
        }
        // Ensure qty is a number
        if (item.inventory[locId]) {
          item.inventory[locId].qty = Number(item.inventory[locId].qty) || 0;
        }
      });
    }
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
        return new Response(JSON.stringify({ error: 'Missing required parameters: itemId, fromLocation, toLocation, quantity' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const transferQty = Number(quantity);
      if (transferQty <= 0 || !Number.isInteger(transferQty)) {
        return new Response(JSON.stringify({ error: 'Quantity must be a positive integer' }), {
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

      // Ensure inventory object exists
      if (!item.inventory) item.inventory = {};

      // Validate source location exists and has sufficient quantity
      const fromQty = Number(item.inventory[fromLocation]?.qty || 0);
      if (fromQty < transferQty) {
        return new Response(JSON.stringify({
          error: `Insufficient quantity at source location. Available: ${fromQty}, Requested: ${transferQty}`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Prevent transferring to the same location
      if (fromLocation === toLocation) {
        return new Response(JSON.stringify({ error: 'Cannot transfer to the same location' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update source location
      item.inventory[fromLocation] = {
        qty: fromQty - transferQty,
        lastUpdated: new Date().toISOString()
      };

      // Update destination location
      const toQty = Number(item.inventory[toLocation]?.qty || 0);
      item.inventory[toLocation] = {
        qty: toQty + transferQty,
        lastUpdated: new Date().toISOString()
      };

      // Clean up empty inventory entries (optional - keeps data clean)
      if (item.inventory[fromLocation].qty === 0) {
        delete item.inventory[fromLocation];
      }

      await writeBlobData('inventory', inventory);
      return new Response(JSON.stringify({
        success: true,
        message: `Transferred ${transferQty} units from ${fromLocation} to ${toLocation}`
      }), {
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