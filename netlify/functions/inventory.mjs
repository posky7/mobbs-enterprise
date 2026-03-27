import { getStore } from '@netlify/blobs'

export default async (req) => {
  const store = getStore({ name: 'stockpro', consistency: 'strong' })

  if (req.method === 'GET') {
    const data = await store.get('inventory', { type: 'json' })
    return Response.json(data || [])
  }

  if (req.method === 'PUT') {
    const body = await req.json()
    await store.setJSON('inventory', body)
    return Response.json({ ok: true })
  }

  return new Response('Method not allowed', { status: 405 })
}
