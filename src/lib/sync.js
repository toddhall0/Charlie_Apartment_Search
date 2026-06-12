// Client-side sync against the shared /api/data endpoint.
//
// The shared store is the source of truth; localStorage remains an offline
// cache. These helpers never throw — on any failure they resolve to a value
// that lets the app keep working locally.

const ENDPOINT = '/api/data'

// Fetch the shared blob. Resolves to { meta, custom, updatedAt } or null if
// the store is unavailable / unconfigured.
export async function fetchRemote() {
  try {
    const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    return {
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      custom: Array.isArray(data.custom) ? data.custom : [],
      updatedAt: data.updatedAt || 0,
    }
  } catch {
    return null
  }
}

// Push the shared blob. Resolves to { updatedAt } on success, or false on
// failure (e.g. offline or store unconfigured).
export async function pushRemote({ meta, custom }) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta, custom }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (!data || !data.ok) return false
    return { updatedAt: data.updatedAt || Date.now() }
  } catch {
    return false
  }
}
