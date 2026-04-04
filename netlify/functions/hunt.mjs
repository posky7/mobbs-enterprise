import { readBlobData, writeBlobData } from './_blob-storage.mjs';

const MIGRATION_VERSION = 1;

function migrateHuntItem(item) {
  // Ensure item is a valid object
  if (!item || typeof item !== 'object') {
    throw new Error('Hunt item is not a valid object');
  }

  if (!item.version) {
    item.version = MIGRATION_VERSION;

    // Initialize photos array if it doesn't exist
    if (!Array.isArray(item.photos)) {
      item.photos = [];
    }

    // Ensure photos array contains only strings (image IDs)
    item.photos = item.photos.filter(photo => typeof photo === 'string');

    // Add timestamps if missing
    if (!item.created) {
      item.created = new Date().toISOString();
    }
    if (!item.updated) {
      item.updated = new Date().toISOString();
    }

    // Ensure category is a string
    if (typeof item.category !== 'string') {
      item.category = 'Other';
    }

    // Ensure name is a string
    if (typeof item.name !== 'string') {
      item.name = 'Unnamed Item';
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

  try {
    if (httpMethod === 'GET') {
      let huntItems = await readBlobData('hunt');

      // Safely migrate hunt items with error handling
      const migratedHuntItems = [];
      const migrationErrors = [];

      for (let i = 0; i < huntItems.length; i++) {
        try {
          // Basic validation before migration
          if (!huntItems[i] || typeof huntItems[i] !== 'object') {
            console.warn(`Skipping invalid hunt item at index ${i}: not an object`);
            migrationErrors.push({ index: i, error: 'Invalid item format' });
            continue;
          }

          const migratedItem = migrateHuntItem(huntItems[i]);
          migratedHuntItems.push(migratedItem);
        } catch (error) {
          console.error(`Migration failed for hunt item at index ${i}:`, error);
          migrationErrors.push({ index: i, error: error.message });

          // Try to preserve the original item if migration fails
          try {
            if (huntItems[i] && typeof huntItems[i] === 'object') {
              migratedHuntItems.push(huntItems[i]);
            }
          } catch (preserveError) {
            console.error(`Could not preserve original hunt item at index ${i}:`, preserveError);
          }
        }
      }

      // Log migration summary
      if (migrationErrors.length > 0) {
        console.warn(`Hunt items migration completed with ${migrationErrors.length} errors out of ${huntItems.length} items`);
      }

      // Only write back if we have valid migrated data
      if (migratedHuntItems.length > 0) {
        try {
          await writeBlobData('hunt', migratedHuntItems);
        } catch (writeError) {
          console.error('Failed to write migrated hunt items data:', writeError);
          // Continue with response even if write fails
        }
      }

      return new Response(JSON.stringify(migratedHuntItems), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'PUT') {
      /** @type {any[] | object} */
      const data = await req.json().catch(() => []);

      // Safely migrate hunt items with error handling
      const migrated = [];
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          try {
            if (!data[i] || typeof data[i] !== 'object') {
              console.warn(`Skipping invalid hunt item at index ${i} in PUT request`);
              continue;
            }
            migrated.push(migrateHuntItem(data[i]));
          } catch (error) {
            console.error(`Migration failed for hunt item at index ${i} in PUT request:`, error);
            // Skip corrupted items
          }
        }
      } else {
        // Single item
        try {
          if (data && typeof data === 'object') {
            migrated.push(migrateHuntItem(data));
          }
        } catch (error) {
          console.error('Migration failed for single hunt item in PUT request:', error);
          return new Response(JSON.stringify({ error: 'Failed to migrate hunt item data' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      await writeBlobData('hunt', migrated);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'DELETE') {
      await writeBlobData('hunt', []);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (httpMethod === 'POST') {
      /** @type {any[] | object} */
      const data = await req.json().catch(() => []);

      // Safely migrate hunt items with error handling
      const migrated = [];
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          try {
            if (!data[i] || typeof data[i] !== 'object') {
              console.warn(`Skipping invalid hunt item at index ${i} in POST request`);
              continue;
            }
            migrated.push(migrateHuntItem(data[i]));
          } catch (error) {
            console.error(`Migration failed for hunt item at index ${i} in POST request:`, error);
            // Skip corrupted items
          }
        }
      } else {
        // Single item
        try {
          if (data && typeof data === 'object') {
            migrated.push(migrateHuntItem(data));
          }
        } catch (error) {
          console.error('Migration failed for single hunt item in POST request:', error);
          return new Response(JSON.stringify({ error: 'Failed to migrate hunt item data' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      await writeBlobData('hunt', migrated);
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
    console.error('Hunt items handler error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}