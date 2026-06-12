// localStorage-backed persistence for the apartment tracker.
//
// Two keys:
//   apt-meta-v1   -> per-listing tracking state, keyed by listing id:
//                    { [id]: { status, notes, showingDate, showingTime } }
//   apt-custom-v1 -> array of user-added listing objects

const META_KEY = 'apt-meta-v1'
const CUSTOM_KEY = 'apt-custom-v1'

function safeParse(raw, fallback) {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function loadMeta() {
  if (typeof localStorage === 'undefined') return {}
  return safeParse(localStorage.getItem(META_KEY), {})
}

export function saveMeta(meta) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch (e) {
    console.warn('Failed to save meta', e)
  }
}

export function loadCustom() {
  if (typeof localStorage === 'undefined') return []
  const data = safeParse(localStorage.getItem(CUSTOM_KEY), [])
  return Array.isArray(data) ? data : []
}

export function saveCustom(custom) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom))
  } catch (e) {
    console.warn('Failed to save custom listings', e)
  }
}

// Export everything as a single JSON blob for backup.
export function exportData() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    meta: loadMeta(),
    custom: loadCustom(),
  }
}

// Trigger a browser download of the backup JSON.
export function downloadExport() {
  const data = exportData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = new Date().toISOString().slice(0, 10)
  a.download = `apartment-tracker-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Import a previously exported blob. Returns { meta, custom } on success.
export function importData(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file')
  }
  const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {}
  const custom = Array.isArray(parsed.custom) ? parsed.custom : []
  saveMeta(meta)
  saveCustom(custom)
  return { meta, custom }
}
