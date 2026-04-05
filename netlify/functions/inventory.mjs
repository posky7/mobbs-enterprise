import { readBlobData, writeBlobData } from './_blob-storage.mjs';

const MIGRATION_VERSION = 1;

function migrateItem(item) {
  // Ensure item is a valid object
  if (!item || typeof item !== 'object') {
    throw new Error('Item is not a valid object');
  }

  if (!item.version) {
    item.version = MIGRATION_VERSION;

    // Initialize inventory object if it doesn't exist or is invalid
    if (!item.inventory || typeof item.inventory !== 'object') {
      item.inventory = {};

      // Migrate legacy qty field to inventory structure
      if (typeof item.qty !== 'undefined' && item.qty !== null) {
        // Use default location if no specific location data exists
        const defaultLocation = 'storage'; // fallback location
        const qty = Number(item.qty);
        item.inventory[defaultLocation] = {
          qty: isNaN(qty) ? 0 : qty,
          lastUpdated: new Date().toISOString()
        };
      }
    }

    // Remove legacy fields after migration
    if (typeof item.qty !== 'undefined') delete item.qty;
    if (typeof item.quantity !== 'undefined') delete item.quantity;
    if (typeof item.price !== 'undefined') delete item.price;

    // Add imageUrl field if it doesn't exist
    if (typeof item.imageUrl === 'undefined') {
      item.imageUrl = null;
    }

    // Ensure all inventory entries have valid quantities
    if (item.inventory && typeof item.inventory === 'object') {
      try {
        Object.keys(item.inventory).forEach(locId => {
          const locationData = item.inventory[locId];
          if (locationData && typeof locationData === 'object') {
            if (locationData.qty === null || typeof locationData.qty === 'undefined') {
              locationData.qty = 0;
            }
            // Ensure qty is a number
            const qty = Number(locationData.qty);
            locationData.qty = isNaN(qty) ? 0 : qty;
          } else if (locationData !== null && typeof locationData !== 'object') {
            // If location data is not an object, reset it
            item.inventory[locId] = { qty: 0, lastUpdated: new Date().toISOString() };
          }
        });
      } catch (inventoryError) {
        console.warn('Error processing inventory data during migration:', inventoryError);
        // Reset inventory to empty object if processing fails
        item.inventory = {};
      }
    }
  }
  return item;
}

/**
 * @param {Request} req
 * @param {import("@netlify/functions").Context} [context]
 */
export default async function handler(req, context) {
  const httpMethod = req.method || 'GET';
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    if (httpMethod === 'GET') {
      let inventory = await readBlobData('inventory');

      // Safely migrate inventory items with error handling
      const migratedInventory = [];
      const migrationErrors = [];

      for (let i = 0; i < inventory.length; i++) {
        try {
          // Basic validation before migration
          if (!inventory[i] || typeof inventory[i] !== 'object') {
            console.warn(`Skipping invalid inventory item at index ${i}: not an object`);
            migrationErrors.push({ index: i, error: 'Invalid item format' });
            continue;
          }

          const migratedItem = migrateItem(inventory[i]);
          migratedInventory.push(migratedItem);
        } catch (error) {
          console.error(`Migration failed for inventory item at index ${i}:`, error);
          migrationErrors.push({ index: i, error: error.message });

          // Try to preserve the original item if migration fails
          try {
            if (inventory[i] && typeof inventory[i] === 'object') {
              migratedInventory.push(inventory[i]);
            }
          } catch (preserveError) {
            console.error(`Could not preserve original item at index ${i}:`, preserveError);
          }
        }
      }

      // Log migration summary
      if (migrationErrors.length > 0) {
        console.warn(`Inventory migration completed with ${migrationErrors.length} errors out of ${inventory.length} items`);
      }

      // Only write back if we have valid migrated data
      if (migratedInventory.length > 0) {
        try {
          await writeBlobData('inventory', migratedInventory);
        } catch (writeError) {
          console.error('Failed to write migrated inventory data:', writeError);
          // Continue with response even if write fails
        }
      }

      return new Response(JSON.stringify(migratedInventory), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'PUT') {
      /** @type {any[] | object} */
      const data = await req.json().catch(() => []);

      // Safely migrate inventory items with error handling
      const migrated = [];
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          try {
            if (!data[i] || typeof data[i] !== 'object') {
              console.warn(`Skipping invalid inventory item at index ${i} in PUT request`);
              continue;
            }
            migrated.push(migrateItem(data[i]));
          } catch (error) {
            console.error(`Migration failed for item at index ${i} in PUT request:`, error);
            // Skip corrupted items
          }
        }
      } else {
        // Single item
        try {
          if (data && typeof data === 'object') {
            migrated.push(migrateItem(data));
          }
        } catch (error) {
          console.error('Migration failed for single item in PUT request:', error);
          return new Response(JSON.stringify({ error: 'Failed to migrate item data' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

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
      /** @type {{ itemId?: string, fromLocation?: string, toLocation?: string, quantity?: any }} */
      const { itemId, fromLocation, toLocation, quantity } = await req.json().catch(() => ({}));

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
      let item = inventory.find(i => i.id === itemId);
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

    // Update item action (used for partial item updates)
    if (httpMethod === 'POST' && action === 'updateItem') {
      /** @type {{ itemId?: string, patch?: object }} */
      const { itemId, patch } = await req.json().catch(() => ({}));

      if (!itemId || !patch) {
        return new Response(JSON.stringify({ error: 'Missing required parameters: itemId, patch' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (typeof patch !== 'object' || patch === null) {
        return new Response(JSON.stringify({ error: 'Patch must be a valid object' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let inventory = await readBlobData('inventory');
      let item = inventory.find(i => i.id === itemId);
      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Merge patch fields into the item
      Object.assign(item, patch);

      // Migrate the updated item
      try {
        item = migrateItem(item);
      } catch (migrationError) {
        console.error('Migration failed for updated item:', migrationError);
        return new Response(JSON.stringify({ error: 'Failed to migrate updated item data' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      await writeBlobData('inventory', inventory);
      return new Response(JSON.stringify(item), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Record sale action (used for recording item sales)
    if (httpMethod === 'POST' && action === 'recordSale') {
      /** @type {{ itemId?: string, location?: string, qtySold?: any, actualPrice?: any, date?: string, feePercent?: any }} */
      const { itemId, location, qtySold, actualPrice, date, feePercent } = await req.json().catch(() => ({}));

      if (!itemId || !location || !qtySold || !actualPrice || !date) {
        return new Response(JSON.stringify({ error: 'Missing required parameters: itemId, location, qtySold, actualPrice, date' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const saleQty = Number(qtySold);
      const salePrice = Number(actualPrice);
      const feePct = Number(feePercent) || 0;

      if (saleQty <= 0 || !Number.isInteger(saleQty)) {
        return new Response(JSON.stringify({ error: 'qtySold must be a positive integer' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (salePrice < 0) {
        return new Response(JSON.stringify({ error: 'actualPrice must be non-negative' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (feePct < 0 || feePct > 100) {
        return new Response(JSON.stringify({ error: 'feePercent must be between 0 and 100' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let inventory = await readBlobData('inventory');
      let item = inventory.find(i => i.id === itemId);
      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Ensure inventory object exists
      if (!item.inventory) item.inventory = {};

      // Validate location exists and has sufficient quantity
      const currentQty = Number(item.inventory[location]?.qty || 0);
      if (currentQty < saleQty) {
        return new Response(JSON.stringify({
          error: `Insufficient quantity at location. Available: ${currentQty}, Requested: ${saleQty}`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Subtract quantity from inventory
      item.inventory[location] = {
        qty: currentQty - saleQty,
        lastUpdated: new Date().toISOString()
      };

      // Ensure salesHistory array exists
      if (!item.salesHistory) item.salesHistory = [];

      // Calculate profit: (actualPrice - fee) - (qtySold * totalCostPerUnit)
      const feeAmount = salePrice * (feePct / 100);
      const effectiveRevenue = salePrice - feeAmount;
      const totalCostPerUnit = Number(item.cost || 0) + Number(item.labor || 0);
      const costOfGoods = saleQty * totalCostPerUnit;
      const profit = effectiveRevenue - costOfGoods;

      // Append sale record
      const saleRecord = {
        id: Date.now().toString(),
        date,
        location,
        qtySold: saleQty,
        actualPrice: salePrice,
        feePercent: feePct,
        profit
      };
      item.salesHistory.push(saleRecord);

      // Migrate the updated item
      try {
        item = migrateItem(item);
      } catch (migrationError) {
        console.error('Migration failed for item after sale recording:', migrationError);
        return new Response(JSON.stringify({ error: 'Failed to migrate item data after sale' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      await writeBlobData('inventory', inventory);
      return new Response(JSON.stringify(item), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update notes action (used for updating item notes)
    if (httpMethod === 'POST' && action === 'updateNotes') {
      /** @type {{ itemId?: string, notes?: string }} */
      const { itemId, notes } = await req.json().catch(() => ({}));

      if (!itemId) {
        return new Response(JSON.stringify({ error: 'Missing required parameter: itemId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let inventory = await readBlobData('inventory');
      let item = inventory.find(i => i.id === itemId);
      if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Set notes field (create if it doesn't exist)
      item.notes = notes;

      // Migrate the updated item
      try {
        item = migrateItem(item);
      } catch (migrationError) {
        console.error('Migration failed for item after notes update:', migrationError);
        return new Response(JSON.stringify({ error: 'Failed to migrate item data after notes update' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      await writeBlobData('inventory', inventory);
      return new Response(JSON.stringify(item), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'POST') {
      /** @type {any[] | object} */
      const data = await req.json().catch(() => []);

      // Safely migrate inventory items with error handling
      const migrated = [];
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          try {
            if (!data[i] || typeof data[i] !== 'object') {
              console.warn(`Skipping invalid inventory item at index ${i} in POST request`);
              continue;
            }
            migrated.push(migrateItem(data[i]));
          } catch (error) {
            console.error(`Migration failed for item at index ${i} in POST request:`, error);
            // Skip corrupted items
          }
        }
      } else {
        // Single item
        try {
          if (data && typeof data === 'object') {
            migrated.push(migrateItem(data));
          }
        } catch (error) {
          console.error('Migration failed for single item in POST request:', error);
          return new Response(JSON.stringify({ error: 'Failed to migrate item data' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

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