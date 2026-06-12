// Geo helpers: haversine distance, nearest-neighbor route ordering,
// StreetEasy URL parsing, and Nominatim geocoding.

// Approximate borough-center fallbacks (used when geocoding fails).
export const BOROUGH_CENTERS = {
  Brooklyn: { latitude: 40.6782, longitude: -73.9442 },
  Manhattan: { latitude: 40.7831, longitude: -73.9712 },
  Queens: { latitude: 40.7282, longitude: -73.7949 },
  Bronx: { latitude: 40.8448, longitude: -73.8648 },
  'Staten Island': { latitude: 40.5795, longitude: -74.1502 },
}

// Great-circle distance between two lat/lng points, in miles.
export function haversine(a, b) {
  const R = 3958.8 // earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Order stops by nearest-neighbor starting from `startIndex`.
// Returns a new array of stops in visiting order.
export function nearestNeighborRoute(stops, startIndex = 0) {
  if (!stops || stops.length === 0) return []
  const remaining = stops.slice()
  const start = remaining.splice(startIndex, 1)[0]
  const route = [start]
  let current = start
  while (remaining.length) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current, remaining[i])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    current = remaining.splice(bestIdx, 1)[0]
    route.push(current)
  }
  return route
}

// Title-case a slug word but keep leading-number tokens as-is
// (e.g. "932" stays "932", "new" -> "New").
function titleCaseWord(word) {
  if (!word) return word
  if (/^\d/.test(word)) return word // keep leading numbers (e.g. street numbers)
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

const SLUG_BOROUGH_SUFFIXES = [
  { suffix: 'staten-island', borough: 'Staten Island' },
  { suffix: 'new_york', borough: 'Manhattan' },
  { suffix: 'brooklyn', borough: 'Brooklyn' },
  { suffix: 'queens', borough: 'Queens' },
  { suffix: 'bronx', borough: 'Bronx' },
]

// Parse a StreetEasy building URL into { address, unit, borough, url }.
// Example:
//   https://streeteasy.com/building/932-new-york-avenue-brooklyn/4b?utm=...
//   -> { address: "932 New York Avenue", unit: "#4B", borough: "Brooklyn" }
// Returns null if the URL isn't a recognizable StreetEasy building URL.
export function parseStreetEasyUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!/streeteasy\.com$/i.test(url.hostname) && !/\.streeteasy\.com$/i.test(url.hostname)) {
    return null
  }
  // Strip query/hash, split path.
  const parts = url.pathname.split('/').filter(Boolean)
  // Expect: ["building", "<slug>", "<unit>"]
  const bIdx = parts.indexOf('building')
  if (bIdx === -1 || !parts[bIdx + 1]) return null

  let slug = parts[bIdx + 1]
  const unitRaw = parts[bIdx + 2] || ''

  // Detect and strip a trailing borough suffix from the slug.
  let borough = null
  for (const { suffix, borough: b } of SLUG_BOROUGH_SUFFIXES) {
    if (slug.toLowerCase().endsWith('-' + suffix)) {
      borough = b
      slug = slug.slice(0, slug.length - (suffix.length + 1))
      break
    }
  }

  // Build the address from the remaining slug words.
  const address = slug
    .split('-')
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ')

  // Format the unit. StreetEasy unit slugs are like "4b" -> "#4B".
  let unit = ''
  if (unitRaw) {
    const cleaned = unitRaw.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (cleaned) unit = '#' + cleaned
  }

  return {
    address: address || '',
    unit,
    borough, // may be null -> caller keeps user-selected borough
    url: url.origin + url.pathname,
  }
}

// Geocode "{address}, {borough}, NY" via Nominatim.
// Resolves to { latitude, longitude, approximate: false } on success,
// or throws on failure so the caller can fall back to a borough center.
export async function geocode(address, borough) {
  const q = `${address}, ${borough}, NY`
  const endpoint =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(q)
  const res = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No geocoding result')
  }
  const { lat, lon } = data[0]
  const latitude = parseFloat(lat)
  const longitude = parseFloat(lon)
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new Error('Bad geocoding coordinates')
  }
  return { latitude, longitude, approximate: false }
}

// Geocode with a borough-center fallback. Always resolves.
export async function geocodeWithFallback(address, borough) {
  try {
    return await geocode(address, borough)
  } catch {
    const center = BOROUGH_CENTERS[borough] || BOROUGH_CENTERS.Brooklyn
    return { ...center, approximate: true }
  }
}
