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

      // Validate required parameters
      if (!itemId || !fromLocation || !toLocation || !quantity || quantity <= 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing or invalid required parameters: itemId, fromLocation, toLocation, and quantity (> 0) are required' })
        };
      }

      // Validate quantity is a positive number
      const transferQty = Number(quantity);
      if (isNaN(transferQty) || transferQty <= 0 || !Number.isInteger(transferQty)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Quantity must be a positive integer' })
        };
      }

      const inventory = await readBlobData('inventory');
      const item = inventory.find(i => i.id === itemId);

      if (!item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: `Item with ID '${itemId}' not found` })
        };
      }

      // Initialize inventory object if it doesn't exist
      if (!item.inventory) item.inventory = {};

      // Check if source location exists and has enough quantity
      const sourceQty = Number(item.inventory[fromLocation]?.qty || 0);
      if (sourceQty < transferQty) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Insufficient quantity in source location '${fromLocation}': ${sourceQty} available, ${transferQty} requested`
          })
        };
      }

      // Prevent negative inventory (extra safety check)
      if (sourceQty - transferQty < 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Transfer would result in negative inventory: ${sourceQty} - ${transferQty} = ${sourceQty - transferQty}`
          })
        };
      }

      // Perform the transfer
      const newSourceQty = sourceQty - transferQty;
      const targetQty = Number(item.inventory[toLocation]?.qty || 0);
      const newTargetQty = targetQty + transferQty;

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
          message: `Successfully transferred ${transferQty} units from ${fromLocation} to ${toLocation}`,
          details: {
            itemId,
            fromLocation,
            toLocation,
            quantity: transferQty,
            newSourceQty,
            newTargetQty
          }
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
