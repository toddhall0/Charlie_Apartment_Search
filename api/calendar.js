// Subscribable iCalendar feed for scheduled showings.
//
//   GET /api/calendar(.ics) -> text/calendar with one VEVENT per showing
//
// Reads the shared blob from Redis (same store as /api/data) and merges the
// per-listing meta (showingDate/showingTime/status) onto the seed + custom
// listings. Subscribe to it via webcal:// in Google/Apple/Outlook Calendar for
// ongoing sync; the REFRESH hints ask clients to re-poll roughly hourly.

import { buildICS } from '../src/lib/ics.js'
import seedListings from '../src/data/listings.js'

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'apt-shared-v1'

async function redis(command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error(`Redis REST error ${res.status}`)
  return (await res.json()).result
}

export default async function handler(req, res) {
  let meta = {}
  let custom = []

  if (REST_URL && REST_TOKEN) {
    try {
      const val = await redis(['GET', KEY])
      const parsed = val ? JSON.parse(val) : null
      if (parsed && typeof parsed === 'object') {
        meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {}
        custom = Array.isArray(parsed.custom) ? parsed.custom : []
      }
    } catch {
      // Fall through with whatever we have; the feed still renders seed data.
    }
  }

  const showings = [...seedListings, ...custom]
    .map((l) => {
      const m = meta[l.id] || {}
      return {
        ...l,
        showingDate: m.showingDate || '',
        showingTime: m.showingTime || '',
        status: m.status || l.market_status || '',
      }
    })
    .filter((l) => l.showingDate)

  const ics = buildICS(showings)

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="apartment-showings.ics"')
  // Let Vercel's edge cache hold it briefly so subscriptions stay snappy.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).send(ics)
}
