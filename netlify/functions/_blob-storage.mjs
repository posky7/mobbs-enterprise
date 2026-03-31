import { getStore } from '@netlify/blobs';

// Blob store names for different data types
const STORES = {
  inventory: 'inventory-data',
  locations: 'locations-data',
  expenses: 'expenses-data',
  loans: 'loans-data',
  backupTimestamp: 'backup-timestamp'
};

// Get a blob store instance
function getBlobStore(storeName) {
  try {
    return getStore(storeName);
  } catch (error) {
    console.error(`Failed to get blob store "${storeName}":`, error);
    throw new Error(`Blob storage unavailable: ${error.message}`);
  }
}

// Generic read function
export async function readBlobData(storeName, key = 'data') {
  try {
    const store = getBlobStore(STORES[storeName]);
    const data = await store.get(key);

    if (!data) {
      // Return default data based on store type
      return getDefaultData(storeName);
    }

    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read ${storeName} data:`, error);
    // CRITICAL: DO NOT return default data on errors - this causes silent data loss!
    // Let the calling code handle the error appropriately
    throw error;
  }
}

// Generic write function
export async function writeBlobData(storeName, data, key = 'data') {
  try {
    const store = getBlobStore(STORES[storeName]);
    await store.set(key, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Failed to write ${storeName} data:`, error);
    throw error;
  }
}

// Get default data for each store type
function getDefaultData(storeName) {
  switch (storeName) {
    case 'inventory':
      return [];
    case 'locations':
      return [
        {
          id: 'storage',
          name: 'Storage',
          type: 'storage',
          active: true,
          order: 0,
          isWarehouse: false
        }
      ];
    case 'expenses':
      return [];
    case 'loans':
      return [];
    case 'backupTimestamp':
      return { timestamp: null };
    default:
      return null;
  }
}

// Delete all data from a store (for reset operations)
export async function clearBlobStore(storeName) {
  try {
    const store = getBlobStore(STORES[storeName]);
    await store.delete();
    return true;
  } catch (error) {
    console.error(`Failed to clear ${storeName} store:`, error);
    throw error;
  }
}

// List all stores (for debugging/admin purposes)
export async function listBlobStores() {
  const results = {};
  for (const [key, storeName] of Object.entries(STORES)) {
    try {
      const store = getBlobStore(storeName);
      const keys = await store.list();
      results[key] = {
        store: storeName,
        keys: keys.length,
        available: true
      };
    } catch (error) {
      results[key] = {
        store: storeName,
        available: false,
        error: error.message
      };
    }
  }
  return results;
}