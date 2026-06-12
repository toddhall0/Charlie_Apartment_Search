// Shared-data API for the apartment tracker.
//
// Backed by Upstash Redis via its REST API. Vercel injects the credentials as
// env vars when you add the Upstash/KV integration from the dashboard. We accept
// either the "KV_*" names (Vercel Marketplace KV) or the "UPSTASH_*" names.
//
//   GET  /api/data  -> { meta, custom, updatedAt }
//   POST /api/data  -> body { meta, custom }; stores it, returns { ok, updatedAt }
//
// Single shared dataset, no auth: everyone with the URL reads/writes one blob.

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'apt-shared-v1'

// Run a single Redis command via the Upstash REST API.
async function redis(command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!res.ok) {
    throw new Error(`Redis REST error ${res.status}`)
  }
  const data = await res.json()
  return data.result
}

async function readBody(req) {
  if (req.body != null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  }
  // Fallback: read the raw stream (in case the platform didn't pre-parse).
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export default async function handler(req, res) {
  if (!REST_URL || !REST_TOKEN) {
    return res.status(503).json({ error: 'storage_not_configured' })
  }

  try {
    if (req.method === 'GET') {
      const val = await redis(['GET', KEY])
      const parsed = val ? JSON.parse(val) : { meta: {}, custom: [], updatedAt: 0 }
      return res.status(200).json(parsed)
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req)
      const payload = {
        meta: body && typeof body.meta === 'object' && body.meta ? body.meta : {},
        custom: Array.isArray(body?.custom) ? body.custom : [],
        updatedAt: Date.now(),
      }
      await redis(['SET', KEY, JSON.stringify(payload)])
      return res.status(200).json({ ok: true, updatedAt: payload.updatedAt })
    }

    res.setHeader('Allow', 'GET, POST, PUT')
    return res.status(405).json({ error: 'method_not_allowed' })
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) })
  }
}
