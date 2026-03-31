import { clearBlobStore, setBackupTimestamp } from './_blob-storage.mjs';

export default async function handler(event) {
  const httpMethod = event.httpMethod;

  if (httpMethod !== 'POST' && httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('Reset function called - clearing all data stores');

    await clearBlobStore('inventory');
    await clearBlobStore('locations');
    await clearBlobStore('expenses');
    await clearBlobStore('loans');

    await setBackupTimestamp(null);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true, 
        message: 'All data has been reset successfully' 
      })
    };

  } catch (error) {
    console.error('Reset function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to reset data', 
        details: error.message 
      })
    };
  }
}