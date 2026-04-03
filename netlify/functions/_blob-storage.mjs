import { getStore } from '@netlify/blobs';

const STORES = {
  inventory: 'inventory',
  locations: 'locations',
  expenses: 'expenses',
  loans: 'loans',
  backupTimestamp: 'backup-timestamp',
  images: 'item-images'
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

export async function uploadImage(imageId, imageData, contentType) {
  try {
    console.log(`Blob storage: Uploading image ${imageId}, size: ${imageData.length}, type: ${contentType}`);
    const store = await getBlobStore('images');
    await store.set(imageId, imageData, { metadata: { contentType } });

    // Verify the upload by attempting to retrieve the image
    const verifyBlob = await store.get(imageId);
    if (!verifyBlob) {
      throw new Error(`Upload verification failed: image ${imageId} not found after upload`);
    }

    console.log(`Blob storage: Successfully uploaded and verified ${imageId}`);
    return true;
  } catch (error) {
    console.error(`Blob storage: Error uploading image ${imageId}:`, error);
    throw new Error(`Failed to upload image ${imageId}: ${error.message}`);
  }
}

export async function getImage(imageId) {
  try {
    console.log(`Blob storage: Retrieving image ${imageId}`);
    const store = await getBlobStore('images');
    const blob = await store.get(imageId);
    if (blob) {
      console.log(`Blob storage: Found image ${imageId}, size: ${blob.size}`);
    } else {
      console.log(`Blob storage: Image ${imageId} not found`);
    }
    return blob;
  } catch (error) {
    console.error(`Blob storage: Error retrieving image ${imageId}:`, error);
    return null;
  }
}

export async function deleteImage(imageId) {
  try {
    const store = await getBlobStore('images');
    await store.delete(imageId);
    return true;
  } catch (error) {
    console.error(`Error deleting image ${imageId}:`, error);
    throw error;
  }
}
