import { clearBlobStore } from './_blob-storage.mjs';

export default async function handler(event, context) {
  const { httpMethod, queryStringParameters } = event;

  try {
    if (httpMethod === 'DELETE') {
      // Clear all data stores
      const stores = ['inventory', 'locations', 'expenses', 'loans', 'backupTimestamp'];

      for (const store of stores) {
        try {
          await clearBlobStore(store);
        } catch (error) {
          console.error(`Failed to clear ${store} store:`, error);
          // Continue with other stores even if one fails
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'All data has been permanently deleted from blob storage',
          success: true,
          warning: 'This action cannot be undone'
        })
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed. Use DELETE to reset all data.' })
    };

  } catch (error) {
    console.error('Reset API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error during reset' })
    };
  }
}
