// Best-effort server-side scraper for StreetEasy listing pages.
//
// StreetEasy blocks browsers via CORS and uses bot protection (PerimeterX),
// so this must run server-side. Even here, StreetEasy may serve a challenge
// page to datacenter IPs. We fetch with browser-like headers, then parse
// whatever HTML we get for the fields we care about. The response always
// includes a `blocked` flag and the upstream `status` for diagnostics.
//
//   GET /api/scrape?url=<streeteasy building url>
//   -> { ok, blocked, status, fields: { base_rent, net_effective_rent,
//        concession_note, beds, baths, neighborhood, available, address,
//        photo_url }, debug }

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function isStreetEasy(raw) {
  try {
    const u = new URL(raw)
    return /(^|\.)streeteasy\.com$/i.test(u.hostname)
  } catch {
    return false
  }
}

// Markers that indicate a bot-protection / challenge page rather than content.
function looksBlocked(html, status) {
  if (status === 403 || status === 429 || status === 503) return true
  if (!html) return true
  const m = html.toLowerCase()
  return (
    m.includes('px-captcha') ||
    m.includes('perimeterx') ||
    m.includes('press & hold') ||
    m.includes('access to this page has been denied') ||
    m.includes('are you a human') ||
    m.includes('captcha-bypass')
  )
}

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i'
  )
  const m = html.match(re)
  if (m) return decodeEntities(m[1])
  // attribute order can be reversed
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i'
  )
  const m2 = html.match(re2)
  return m2 ? decodeEntities(m2[1]) : null
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function toNumber(s) {
  if (s == null) return null
  const n = Number(String(s).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

// Pull structured data out of any JSON-LD blocks.
function parseJsonLd(html) {
  const out = {}
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    let data
    try {
      data = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    const nodes = Array.isArray(data) ? data : [data]
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const offers = node.offers || (node.mainEntity && node.mainEntity.offers)
      if (offers && (offers.price || offers.priceSpecification)) {
        out.base_rent =
          toNumber(offers.price) ||
          toNumber(offers.priceSpecification && offers.priceSpecification.price) ||
          out.base_rent
      }
      if (node.numberOfRooms != null) out.beds = toNumber(node.numberOfRooms)
      if (node.address && node.address.addressLocality)
        out.neighborhood = out.neighborhood || node.address.addressLocality
      if (node.image && !out.photo_url) {
        out.photo_url = Array.isArray(node.image) ? node.image[0] : node.image
      }
    }
  }
  return out
}

// Heuristic regex passes over the visible HTML/text.
function parseHeuristics(html) {
  const out = {}
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  // Net effective rent.
  let m = text.match(/net effective[^$]{0,40}\$\s?([\d,]+)/i)
  if (m) out.net_effective_rent = toNumber(m[1])

  // Base / advertised rent (first "$X,XXX" that looks like monthly rent).
  m = text.match(/\$\s?([\d,]{4,})\s*(?:\/\s*mo|per month|monthly)?/i)
  if (m) out.base_rent_guess = toNumber(m[1])

  // Concession: "N months free" / "1 month free".
  m = text.match(/(\d+(?:\.\d+)?)\s+months?\s+free/i)
  if (m) out.concession_note = `${m[1]} month${m[1] === '1' ? '' : 's'} free`

  // Beds.
  if (/\bstudio\b/i.test(text)) out.beds = 0
  else {
    m = text.match(/(\d+)\s*beds?\b/i)
    if (m) out.beds = toNumber(m[1])
  }

  // Baths.
  m = text.match(/(\d+(?:\.\d+)?)\s*baths?\b/i)
  if (m) out.baths = toNumber(m[1])

  // Available date.
  m = text.match(/available\s+(?:on\s+)?([A-Z][a-z]{2,9}\.?\s+\d{1,2}(?:,\s*\d{4})?|now)/i)
  if (m) out.available = m[1]

  return out
}

export default async function handler(req, res) {
  const url = req.query && req.query.url
  if (!url || !isStreetEasy(url)) {
    return res.status(400).json({ ok: false, error: 'Provide a valid streeteasy.com url' })
  }

  let status = 0
  let html = ''
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Referer: 'https://www.google.com/',
      },
      redirect: 'follow',
    })
    status = upstream.status
    html = await upstream.text()
  } catch (e) {
    return res.status(502).json({ ok: false, blocked: true, status, error: String(e.message || e) })
  }

  const blocked = looksBlocked(html, status)
  if (blocked) {
    return res.status(200).json({
      ok: false,
      blocked: true,
      status,
      fields: {},
      debug: { length: html.length },
    })
  }

  const ld = parseJsonLd(html)
  const heur = parseHeuristics(html)
  const ogTitle = metaContent(html, 'og:title')
  const ogImage = metaContent(html, 'og:image')

  const base_rent = ld.base_rent ?? heur.base_rent_guess ?? null
  const fields = {
    address: ogTitle || null,
    base_rent,
    net_effective_rent: heur.net_effective_rent ?? null,
    concession_note: heur.concession_note ?? null,
    beds: ld.beds ?? heur.beds ?? null,
    baths: heur.baths ?? null,
    neighborhood: ld.neighborhood ?? null,
    available: heur.available ?? null,
    photo_url: ld.photo_url || ogImage || null,
  }

  const found = Object.values(fields).some((v) => v != null)
  return res.status(200).json({
    ok: found,
    blocked: false,
    status,
    fields,
    debug: { length: html.length, hasLd: Object.keys(ld).length > 0 },
  })
}
