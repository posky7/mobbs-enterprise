import { getStore } from '@netlify/blobs';

const STORES = {
  inventory: 'inventory',
  locations: 'locations',
  expenses: 'expenses',
  loans: 'loans',
  backupTimestamp: 'backup-timestamp'
};

export async function getBlobStore(name) {
  const storeName = STORES[name] || name;
  return getStore({ name: storeName, consistency: 'strong' });
}

export async function readBlobData(key) {
  try {
    const store = await getBlobStore(key);
    const data = await store.get(key, { type: 'json' });
    return data || [];
  } catch (error) {
    console.error(`Error reading blob ${key}:`, error);
    return [];
  }
}

export async function writeBlobData(key, data) {
  try {
    const store = await getBlobStore(key);
    await store.setJSON(key, data);
    return true;
  } catch (error) {
    console.error(`Error writing blob ${key}:`, error);
    throw error;
  }
}

export async function clearBlobStore(key) {
  try {
    const store = await getBlobStore(key);
    await store.deleteAll();
    return true;
  } catch (error) {
    console.error(`Error clearing blob store ${key}:`, error);
    throw error;
  }
}

export async function getBackupTimestamp() {
  try {
    const store = await getBlobStore('backupTimestamp');
    return await store.get('timestamp', { type: 'json' }) || null;
  } catch {
    return null;
  }
}

export async function setBackupTimestamp(timestamp) {
  try {
    const store = await getBlobStore('backupTimestamp');
    await store.setJSON('timestamp', timestamp);
  } catch (error) {
    console.error('Error setting backup timestamp:', error);
  }
}