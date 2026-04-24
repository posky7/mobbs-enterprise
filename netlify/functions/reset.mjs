import { clearBlobStore, setBackupTimestamp, writeBlobData } from './_blob-storage.mjs';

/**
 * @param {Request} req
 * @param {import("@netlify/functions").Context} [context]
 */
export default async function handler(req, context) {
  const httpMethod = req.method;

  if (httpMethod !== 'POST' && httpMethod !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');

  // Clean mode: overwrite all stores with empty arrays, no demo seeding
  if (mode === 'clean') {
    const errors = [];
    for (const store of ['inventory', 'locations', 'expenses', 'loans']) {
      try {
        await writeBlobData(store, []);
      } catch (err) {
        console.error(`Clean wipe failed for store ${store}:`, err);
        errors.push(`${store}: ${err.message}`);
      }
    }
    try { await setBackupTimestamp(null); } catch {}

    if (errors.length) {
      return new Response(JSON.stringify({
        error: 'Partial wipe — some stores failed',
        details: errors
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'All data wiped. No demo data seeded.'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    console.log('Reset function called - clearing all data stores');

    await clearBlobStore('inventory');
    await clearBlobStore('locations');
    await clearBlobStore('expenses');
    await clearBlobStore('loans');

    await setBackupTimestamp(null);

    // Seed demo data for inventory page
    const sampleLocations = [
      {
        id: 'retail-1',
        name: 'Retail Booth',
        active: true,
        type: 'retail',
        monthlyRent: 0,
        transactionFeePercent: 3.5,
        isWarehouse: false
      },
      {
        id: 'warehouse-1',
        name: 'Warehouse',
        active: true,
        type: 'storage',
        monthlyRent: 0,
        transactionFeePercent: 0,
        isWarehouse: true
      }
    ];
    await writeBlobData('locations', sampleLocations);

    const sampleInventory = [
      {
        id: 'item-1',
        name: 'Vintage Teacup Set',
        category: 'Ceramic Tableware',
        cost: 12.50,
        labor: 2.00,
        suggestedPrice: 45.00,
        reorderPt: 5,
        notes: 'Delicate, handle with care',
        inventory: {
          'retail-1': { qty: 8, lastUpdated: new Date().toISOString() },
          'warehouse-1': { qty: 20, lastUpdated: new Date().toISOString() }
        },
        unit: 'sets'
      },
      {
        id: 'item-2',
        name: 'Crystal Vase',
        category: 'Clear Glassware',
        cost: 25.00,
        labor: 1.50,
        suggestedPrice: 85.00,
        reorderPt: 3,
        inventory: {
          'retail-1': { qty: 2, lastUpdated: new Date().toISOString() }
        },
        unit: 'pcs'
      },
      {
        id: 'item-3',
        name: 'Abstract Painting',
        category: 'Art',
        cost: 150.00,
        labor: 5.00,
        suggestedPrice: 450.00,
        reorderPt: 1,
        notes: 'Sold one last week',
        salesHistory: [{
          date: new Date(Date.now() - 86400000).toISOString(),
          location: 'retail-1',
          qtySold: 1,
          actualPrice: 420,
          feePercent: 3.5,
          profit: 250.25
        }],
        inventory: {
          'warehouse-1': { qty: 0, lastUpdated: new Date().toISOString() }
        },
        unit: 'pcs'
      }
    ];
    await writeBlobData('inventory', sampleInventory);

    return new Response(JSON.stringify({
      success: true,
        message: 'All data reset and seeded with demo inventory & locations'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Reset function error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to reset data',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}