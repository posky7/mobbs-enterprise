import { getStore } from '@netlify/blobs'

export default async (req) => {
  if (req.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 })
  }

  const store = getStore({ name: 'stockpro', consistency: 'strong' })

  await Promise.all([
    store.delete('inventory'),
    store.delete('loans'),
    store.delete('expenses'),
    store.delete('backup-timestamp'),
  ])

  return Response.json({ ok: true })
}
