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

// Scraping-provider config. StreetEasy blocks datacenter IPs (403), so we
// route through a residential-proxy / JS-rendering service when a key is set.
// Supported providers: "scraperapi" (default) and "scrapingbee".
const SCRAPER_KEY = process.env.SCRAPER_API_KEY
const SCRAPER_PROVIDER = (process.env.SCRAPER_PROVIDER || 'scraperapi').toLowerCase()

// Build the provider request URL that returns the target page's HTML.
// opts.render enables JS execution (runs the PerimeterX challenge); opts.ultra
// uses the hardest residential/stealth proxy pool. We escalate to both only on
// a retry, so a normal fetch stays cheap.
function proxyUrl(target, opts = {}) {
  if (SCRAPER_PROVIDER === 'scrapingbee') {
    const p = new URLSearchParams({
      api_key: SCRAPER_KEY,
      url: target,
      render_js: opts.render ? 'true' : 'false',
      premium_proxy: 'true',
      country_code: 'us',
    })
    if (opts.ultra) p.set('stealth_proxy', 'true')
    return 'https://app.scrapingbee.com/api/v1/?' + p.toString()
  }
  // Default: ScraperAPI. premium/ultra_premium select residential proxy pools
  // needed to get past StreetEasy's bot protection; ultra_premium + render is
  // the strongest (and priciest) combination, used only as an escalation.
  const p = new URLSearchParams({ api_key: SCRAPER_KEY, url: target, country_code: 'us' })
  if (opts.ultra) p.set('ultra_premium', 'true')
  else p.set('premium', 'true')
  if (opts.render) p.set('render', 'true')
  return 'https://api.scraperapi.com/?' + p.toString()
}

// The scraping provider (not StreetEasy) rejected us: bad/expired key, or the
// account is out of credits / on the wrong plan. Worth telling the user, since
// retrying won't help.
function providerAuthReason(html, status) {
  const m = (html || '').toLowerCase()
  if (status === 401) return 'scraper_auth'
  if (m.includes('out of credits') || m.includes('credit') || m.includes('quota') || m.includes('exceeded')) {
    return 'scraper_credits'
  }
  if (status === 403 && (m.includes('api key') || m.includes('scraperapi') || m.includes('scrapingbee'))) {
    return 'scraper_auth'
  }
  return null
}

// Allow up to 60s — proxied scrapes can be slow (default Vercel cap is 10s).
export const maxDuration = 60

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
  // Treat any 4xx/5xx (auth challenge, rate limit, or transient proxy error)
  // as "couldn't read it" so we don't mistake a hiccup for a real result.
  if (status === 403 || status === 429 || status >= 500) return true
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

  // Net effective rent — try both label orders ("Net effective … $X" and
  // "$X … net effective").
  let m =
    text.match(/net effective(?:\s*rent)?[^$\d]{0,20}\$\s?([\d,]{3,})/i) ||
    text.match(/\$\s?([\d,]{3,})[^$\d]{0,20}net effective/i)
  if (m) out.net_effective_rent = toNumber(m[1])

  // Explicitly labeled gross/asking rent (StreetEasy shows this on concession
  // listings alongside the net effective figure).
  m = text.match(/gross(?:\s*rent)?[^$\d]{0,20}\$\s?([\d,]{3,})/i)
  if (m) out.gross_rent = toNumber(m[1])

  // First plausible monthly "$X,XXX" as a base-rent fallback.
  m = text.match(/\$\s?([\d,]{4,})\s*(?:\/\s*mo|per month|monthly)?/i)
  const firstDollar = m ? toNumber(m[1]) : null

  // Concession: "N months free" + lease term ("on a 12-month lease").
  m = text.match(/(\d+(?:\.\d+)?)\s+months?\s+free/i)
  let monthsFree = null
  if (m) {
    monthsFree = Number(m[1])
    const term = leaseTerm(text)
    out.concession_note = `${m[1]} month${monthsFree === 1 ? '' : 's'} free on ${term}-mo lease`
    out._term = term
  }
  out._monthsFree = monthsFree

  // Base rent: prefer the labeled gross, else the first dollar figure.
  out.base_rent_guess = out.gross_rent ?? firstDollar

  // Derive net effective from base + concession when it wasn't found verbatim.
  // net = base * (term - monthsFree) / term  (matches StreetEasy's math).
  if (
    out.net_effective_rent == null &&
    monthsFree &&
    out.base_rent_guess &&
    out._term > monthsFree
  ) {
    out.net_effective_rent = Math.round((out.base_rent_guess * (out._term - monthsFree)) / out._term)
    out.net_computed = true
  }

  // Beds.
  if (/\bstudio\b/i.test(text)) out.beds = 0
  else {
    m = text.match(/(\d+)\s*beds?\b/i)
    if (m) out.beds = toNumber(m[1])
  }

  // Baths.
  m = text.match(/(\d+(?:\.\d+)?)\s*baths?\b/i)
  if (m) out.baths = toNumber(m[1])

  // Available date — handle month-name, numeric (M/D/YYYY), and "now".
  out.available = parseAvailability(text)

  return out
}

function parseAvailability(text) {
  const month = /([A-Z][a-z]{2,8}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/
  const numeric = /(\d{1,2}\/\d{1,2}\/\d{2,4})/
  const patterns = [
    new RegExp(`date available[:\\s]+${month.source}`, 'i'),
    new RegExp(`date available[:\\s]+${numeric.source}`, 'i'),
    new RegExp(`available\\s+(?:on\\s+|starting\\s+|beginning\\s+)?${month.source}`, 'i'),
    new RegExp(`available\\s+(?:on\\s+|starting\\s+|beginning\\s+)?${numeric.source}`, 'i'),
    /available\s+(immediately|now)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[1].replace(/\s+/g, ' ').trim()
  }
  return null
}

// Signals that might indicate off-market. Generic words ("rented", "in
// contract") are NOT used for the decision because they appear in cross-listing
// sections of perfectly active pages — we only record them for diagnostics.
function marketSignals(html) {
  const tests = {
    thisNoLonger: /this (?:listing|rental|unit|home|apartment) is no longer available/i,
    delisted: /this (?:listing|rental|unit|home|apartment) has been (?:delisted|removed|deactivated)/i,
    noLongerStreeteasy: /no longer available on streeteasy/i,
    // diagnostics only:
    rented: /\brented\b/i,
    inContract: /\bin contract\b/i,
    offMarket: /off the market/i,
    noLongerAvail: /no longer available/i,
    notCurrently: /not currently (?:listed|available)/i,
  }
  const hits = {}
  for (const [k, re] of Object.entries(tests)) hits[k] = re.test(html)
  return hits
}

// Decide market status using only high-precision delisting banners.
function detectMarket(html, baseRent) {
  const s = marketSignals(html)
  if (s.thisNoLonger || s.delisted || s.noLongerStreeteasy) {
    return { flag: 'dead', status: 'No longer available (checked)', hits: s }
  }
  if (baseRent != null) {
    return { flag: 'active', status: 'Active — confirmed live (checked)', hits: s }
  }
  return { flag: 'verify', status: 'Could not confirm availability — verify', hits: s }
}

// Parse a clean street address from the og:title.
// "865 Rogers Avenue #400 in Flatbush, Brooklyn | StreetEasy" -> "865 Rogers Avenue"
// For named-building pages StreetEasy still puts the street address here, so
// this yields the real address rather than the building-name slug.
function streetAddressFromTitle(title) {
  if (!title) return null
  let t = String(title).split('|')[0].trim() // drop "| StreetEasy"
  t = t.split(/\sin\s/i)[0].trim() // drop " in {neighborhood}, {borough}"
  // strip a trailing unit token: "#4B", "Apt 4B", "Unit 12", "#400"
  t = t.replace(/\s*#\s*\S+\s*$/, '').trim()
  t = t.replace(/\s*(?:apt|unit|apartment|ph|fl|floor)\.?\s+\S+\s*$/i, '').trim()
  return t || null
}

// Detect the lease term in months; default to 12.
function leaseTerm(text) {
  const m = text.match(/(\d{1,2})[\s-]*month[\s-]*lease/i)
  if (m) {
    const t = Number(m[1])
    if (t >= 6 && t <= 24) return t
  }
  return 12
}

export default async function handler(req, res) {
  const url = req.query && req.query.url
  if (!url || !isStreetEasy(url)) {
    return res.status(400).json({ ok: false, error: 'Provide a valid streeteasy.com url' })
  }

  // Without a scraping-provider key, a direct fetch will be blocked (403).
  // Tell the client so it can prompt for setup instead of silently failing.
  if (!SCRAPER_KEY) {
    return res.status(200).json({
      ok: false,
      blocked: true,
      status: 0,
      reason: 'no_scraper_key',
      fields: {},
    })
  }

  // Escalation ladder: a cheap non-rendered fetch first, then JS-rendering with
  // the strongest proxy pool if StreetEasy challenges us. Stop as soon as one
  // attempt returns real content.
  const attempts = [
    { render: false, ultra: false },
    { render: true, ultra: true },
  ]

  let status = 0
  let html = ''
  let authReason = null
  const tried = []

  for (const opt of attempts) {
    let attemptStatus = 0
    let attemptHtml = ''
    try {
      const upstream = await fetch(proxyUrl(url, opt), {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      })
      attemptStatus = upstream.status
      attemptHtml = await upstream.text()
    } catch (e) {
      tried.push({ ...opt, status: 'fetch_error', error: String(e.message || e) })
      continue
    }

    status = attemptStatus
    html = attemptHtml
    tried.push({ ...opt, status: attemptStatus, length: attemptHtml.length })

    // Provider auth/credit failure: retrying with more expensive options won't
    // help, so bail out immediately with a clear reason.
    authReason = providerAuthReason(attemptHtml, attemptStatus)
    if (authReason) break

    if (!looksBlocked(attemptHtml, attemptStatus)) break // got real content
  }

  if (authReason) {
    console.error('scrape provider auth issue', { url, authReason, tried })
    return res.status(200).json({ ok: false, blocked: true, status, reason: authReason, fields: {}, debug: { tried } })
  }

  const blocked = looksBlocked(html, status)
  if (blocked) {
    console.error('scrape blocked by upstream', { url, tried })
    return res.status(200).json({
      ok: false,
      blocked: true,
      status,
      reason: 'upstream_blocked',
      fields: {},
      debug: { length: html.length, tried },
    })
  }

  const ld = parseJsonLd(html)
  const heur = parseHeuristics(html)
  const ogTitle = metaContent(html, 'og:title')
  const ogImage = metaContent(html, 'og:image')

  // og:title looks like "865 Rogers Avenue #400 in Flatbush, Brooklyn | StreetEasy"
  // -> pull the neighborhood between "in " and the borough comma.
  let neighborhood = ld.neighborhood ?? null
  if (!neighborhood && ogTitle) {
    const nm = ogTitle.match(/\bin\s+([^,|]+?),/i)
    if (nm) neighborhood = nm[1].trim()
  }

  const base_rent = ld.base_rent ?? heur.base_rent_guess ?? null
  const street = streetAddressFromTitle(ogTitle)
  const market = detectMarket(html, base_rent)
  const fields = {
    // The real street address parsed from the page (not the building-name slug).
    address: street,
    address_raw: ogTitle || null,
    base_rent,
    net_effective_rent: heur.net_effective_rent ?? null,
    net_computed: heur.net_computed || false,
    concession_note: heur.concession_note ?? null,
    beds: ld.beds ?? heur.beds ?? null,
    baths: heur.baths ?? null,
    neighborhood,
    available: heur.available ?? null,
    photo_url: ld.photo_url || ogImage || null,
    market_flag: market.flag,
    market_status: market.status,
  }

  const found = Object.values(fields).some((v) => v != null)
  return res.status(200).json({
    ok: found,
    blocked: false,
    status,
    fields,
    debug: { length: html.length, hasLd: Object.keys(ld).length > 0, marketHits: market.hits },
  })
}
