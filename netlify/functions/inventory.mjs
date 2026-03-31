import { readBlobData, writeBlobData } from './_blob-storage.mjs';

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
  const { httpMethod, body, queryStringParameters } = event;

  try {
    if (httpMethod === 'GET') {
      let inventory = await readBlobData('inventory');

      // Migrate any old-format items on read
      inventory = inventory.map(migrateItem);
      if (inventory.some(item => !item.inventory)) {
        await writeBlobData('inventory', inventory); // Save migrated data
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inventory)
      };
    }

    if (httpMethod === 'PUT') {
      const inventory = JSON.parse(body || '[]');
      await writeBlobData('inventory', inventory);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    if (httpMethod === 'POST' && queryStringParameters?.action === 'transfer') {
      const { itemId, fromLocation, toLocation, quantity } = JSON.parse(body || '{}');

      if (!itemId || !fromLocation || !toLocation || !quantity || quantity <= 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required parameters' })
        };
      }

      const inventory = await readBlobData('inventory');
      const item = inventory.find(i => i.id === itemId);

      if (!item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Item not found' })
        };
      }

      // Initialize inventory object if it doesn't exist
      if (!item.inventory) item.inventory = {};

      // Check if source location has enough quantity
      const sourceQty = Number(item.inventory[fromLocation]?.qty || 0);
      if (sourceQty < quantity) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Insufficient quantity in source location' })
        };
      }

      // Perform the transfer
      const newSourceQty = Math.max(0, sourceQty - quantity);
      const targetQty = Number(item.inventory[toLocation]?.qty || 0);
      const newTargetQty = targetQty + quantity;

      // Update source location
      if (newSourceQty > 0) {
        item.inventory[fromLocation] = {
          qty: newSourceQty,
          lastUpdated: new Date().toISOString()
        };
      } else {
        delete item.inventory[fromLocation];
      }

      // Update target location
      item.inventory[toLocation] = {
        qty: newTargetQty,
        lastUpdated: new Date().toISOString()
      };

      await writeBlobData('inventory', inventory);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: `Transferred ${quantity} units from ${fromLocation} to ${toLocation}`
        })
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
