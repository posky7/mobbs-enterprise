import { readBlobData, writeBlobData } from './_blob-storage.mjs';

// Migration helper: convert old single-qty items to multi-location format
function migrateItem(item) {
  if (item.inventory) return item; // Already migrated

  // Create inventory object with default location, preserving all other item properties
  return {
    ...item,
    inventory: {
      'storage': {
        qty: item.qty || 0,
        lastUpdated: new Date().toISOString()
      }
    },
    qty: undefined // Remove old qty field
  };
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
      if (!itemId || !fromLocation || !toLocation || !quantity) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Missing required parameters',
            details: 'itemId, fromLocation, toLocation, and quantity are required',
            code: 'MISSING_PARAMETERS'
          })
        };
      }

      // Validate quantity is a positive integer
      const transferQty = Number(quantity);
      if (isNaN(transferQty) || transferQty <= 0 || !Number.isInteger(transferQty)) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Invalid quantity',
            details: 'Quantity must be a positive integer',
            code: 'INVALID_QUANTITY'
          })
        };
      }

      // Validate locations are different
      if (fromLocation === toLocation) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Invalid transfer',
            details: 'Source and destination locations must be different',
            code: 'SAME_LOCATION'
          })
        };
      }

      let inventory;
      try {
        inventory = await readBlobData('inventory');
      } catch (readError) {
        console.error('Failed to read inventory data:', readError);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Failed to read inventory data',
            details: 'Unable to access current inventory state',
            code: 'READ_ERROR'
          })
        };
      }

      const itemIndex = inventory.findIndex(i => i.id === itemId);

      if (itemIndex === -1) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Item not found',
            details: `Item with ID '${itemId}' not found in inventory`,
            code: 'ITEM_NOT_FOUND'
          })
        };
      }

      const item = inventory[itemIndex];

      // Ensure inventory object exists
      if (!item.inventory) {
        item.inventory = {};
      }

      // Check if source location exists and has enough quantity
      const sourceQty = Number(item.inventory[fromLocation]?.qty || 0);
      if (sourceQty < transferQty) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Insufficient quantity',
            details: `Only ${sourceQty} units available at source location '${fromLocation}', but ${transferQty} requested`,
            code: 'INSUFFICIENT_QUANTITY',
            available: sourceQty,
            requested: transferQty
          })
        };
      }

      // Create a backup of the original inventory state for rollback
      const originalInventory = JSON.parse(JSON.stringify(inventory));

      // Perform the transfer atomically with rollback capability
      try {
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

        // Save the updated inventory
        try {
          await writeBlobData('inventory', inventory);
        } catch (writeError) {
          console.error('Failed to save inventory after transfer:', writeError);
          // Rollback: restore original inventory state
          try {
            await writeBlobData('inventory', originalInventory);
          } catch (rollbackError) {
            console.error('CRITICAL: Failed to rollback inventory after write failure:', rollbackError);
          }

          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'Failed to save inventory changes',
              details: 'Transfer was rolled back to prevent data loss',
              code: 'SAVE_ERROR'
            })
          };
        }

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            message: `Successfully transferred ${transferQty} units from ${fromLocation} to ${toLocation}`,
            details: {
              itemId,
              itemName: item.name,
              fromLocation,
              toLocation,
              quantity: transferQty,
              newSourceQty,
              newTargetQty
            }
          })
        };
      } catch (transferError) {
        console.error('Transfer operation failed:', transferError);

        // Ensure rollback on any unexpected error
        try {
          await writeBlobData('inventory', originalInventory);
          console.log('Successfully rolled back inventory after transfer error');
        } catch (rollbackError) {
          console.error('CRITICAL: Failed to rollback inventory after transfer error:', rollbackError);
        }

        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Transfer operation failed',
            details: transferError.message || 'An unexpected error occurred during transfer',
            code: 'TRANSFER_ERROR'
          })
        };
      }
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
