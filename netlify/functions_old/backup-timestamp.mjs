import { getStore } from '@netlify/blobs'

export default async (req) => {
  const store = getStore({ name: 'stockpro', consistency: 'strong' })

  if (req.method === 'GET') {
    const data = await store.get('backup-timestamp', { type: 'text' })
    return Response.json({ timestamp: data || null })
  }

  if (req.method === 'PUT') {
    const body = await req.json()
    await store.set('backup-timestamp', body.timestamp)
    return Response.json({ ok: true })
  }

  return new Response('Method not allowed', { status: 405 })
}
