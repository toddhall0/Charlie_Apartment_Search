import { useEffect, useMemo, useRef, useState } from 'react'
import seedListings, { PACE } from './data/listings'
import { SubwayBullets } from './components/SubwayBullet'
import ListingCard from './components/ListingCard'
import AddUnitForm from './components/AddUnitForm'
import BigMap from './components/BigMap'
import ScheduleTab from './components/ScheduleTab'
import { STATUSES, DEFAULT_STATUS, HEADER_LINES } from './constants'
import {
  loadMeta,
  saveMeta,
  loadCustom,
  saveCustom,
  loadChecks,
  saveChecks,
  downloadExport,
  importData,
} from './lib/storage'
import { fetchRemote, pushRemote, scrapeListing } from './lib/sync'
import { geocodeWithFallback, estimateTransitMinutes, formatTransitRange } from './lib/geo'
import { findDuplicateGroups, isDuplicateOf } from './lib/dedupe'

const TABS = ['Listings', 'Map', 'Schedule']
const BOROUGHS = ['All', 'Brooklyn', 'Manhattan', 'Queens', 'Bronx']
const SORTS = [
  { value: 'neighborhood', label: 'Neighborhood' },
  { value: 'net-asc', label: 'Net rent ↑' },
  { value: 'net-desc', label: 'Net rent ↓' },
  { value: 'status', label: 'My status' },
]

function effectiveRent(l) {
  return l.net_effective_rent ?? l.base_rent
}

export default function App() {
  const [meta, setMeta] = useState(() => loadMeta())
  const [custom, setCustom] = useState(() => loadCustom())
  const [tab, setTab] = useState('Listings')

  // Filters / sort.
  const [boroughFilter, setBoroughFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [hideDead, setHideDead] = useState(false)
  const [sort, setSort] = useState('neighborhood')
  const [showSubway, setShowSubway] = useState(true)
  // Subway stations (for the offline transit-commute estimate).
  const [stations, setStations] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch('/subway.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.stations)) setStations(data.stations)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Toast.
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  function showToast(text) {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1400)
  }

  // Persist on change (localStorage = offline cache).
  useEffect(() => saveMeta(meta), [meta])
  useEffect(() => saveCustom(custom), [custom])

  // Keep a ref to the latest custom listings for the background sweep.
  const customRef = useRef(custom)
  useEffect(() => {
    customRef.current = custom
  }, [custom])
  // Latest meta (for reading manual market overrides inside the sweep).
  const metaRef = useRef(meta)
  useEffect(() => {
    metaRef.current = meta
  }, [meta])

  // Per-device record of when each listing's availability was last checked.
  const checksRef = useRef(loadChecks())
  const CHECK_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
  function markChecked(id) {
    checksRef.current = { ...checksRef.current, [id]: Date.now() }
    saveChecks(checksRef.current)
  }
  function checkedRecently(id) {
    const t = checksRef.current[id]
    return t != null && Date.now() - t < CHECK_TTL_MS
  }

  // ---- Cross-device sync against /api/data ----
  // 'offline' | 'syncing' | 'synced'
  const [syncStatus, setSyncStatus] = useState('offline')
  // Serialized snapshot of the last state known to match the server, so the
  // push effect can no-op when we apply remote data (avoids a feedback loop).
  const lastSyncedRef = useRef(JSON.stringify({ meta: loadMeta(), custom: loadCustom() }))
  const remoteUpdatedAtRef = useRef(0)

  function applyRemote(remote) {
    const m = remote.meta || {}
    const c = Array.isArray(remote.custom) ? remote.custom : []
    lastSyncedRef.current = JSON.stringify({ meta: m, custom: c })
    remoteUpdatedAtRef.current = remote.updatedAt || 0
    setMeta(m)
    setCustom(c)
  }

  // Initial load: pull shared data; if the store is empty but this device has
  // local data, migrate it up so nothing is lost on first run.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const remote = await fetchRemote()
      if (cancelled) return
      if (!remote) {
        setSyncStatus('offline')
        return
      }
      const hasRemote = Object.keys(remote.meta).length > 0 || remote.custom.length > 0
      const hasLocal = Object.keys(meta).length > 0 || custom.length > 0
      if (hasRemote) {
        applyRemote(remote)
        setSyncStatus('synced')
      } else if (hasLocal) {
        const ok = await pushRemote({ meta, custom })
        if (!cancelled && ok) {
          lastSyncedRef.current = JSON.stringify({ meta, custom })
          remoteUpdatedAtRef.current = ok.updatedAt
          setSyncStatus('synced')
        }
      } else {
        setSyncStatus('synced')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push local changes to the shared store (debounced).
  useEffect(() => {
    const serialized = JSON.stringify({ meta, custom })
    if (serialized === lastSyncedRef.current) return
    setSyncStatus('syncing')
    const t = setTimeout(async () => {
      const ok = await pushRemote({ meta, custom })
      if (ok) {
        lastSyncedRef.current = serialized
        remoteUpdatedAtRef.current = ok.updatedAt
        setSyncStatus('synced')
      } else {
        setSyncStatus('offline')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [meta, custom])

  // Re-pull when the tab regains focus, so edits from another device show up.
  useEffect(() => {
    async function refresh() {
      if (document.visibilityState === 'hidden') return
      const remote = await fetchRemote()
      if (!remote) return
      if ((remote.updatedAt || 0) > remoteUpdatedAtRef.current) {
        applyRemote(remote)
        setSyncStatus('synced')
      }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Merge seed + custom listings with their per-listing meta.
  const merged = useMemo(() => {
    const all = [...seedListings, ...custom]
    return all.map((l) => {
      const m = meta[l.id] || {}
      // A manual availability override (set on the card) wins over the
      // scraped/seed market flag.
      const override = m.marketOverride || null
      const market_flag = override || l.market_flag
      let market_status = l.market_status
      if (override === 'dead') market_status = 'Marked no longer available'
      else if (override === 'active') market_status = 'Marked available'
      // Offline transit estimate (only when there's no curated commute string).
      let transit_estimate = null
      if (!l.commute_to_pace && stations && l.latitude != null) {
        transit_estimate = formatTransitRange(estimateTransitMinutes(l, stations, PACE))
      }
      return {
        ...l,
        status: m.status || DEFAULT_STATUS,
        notes: m.notes || '',
        showingDate: m.showingDate || '',
        showingTime: m.showingTime || '',
        market_flag,
        market_status,
        marketOverride: override,
        transit_estimate,
      }
    })
  }, [custom, meta, stations])

  // Groups of listings that look like the same apartment (duplicates).
  const duplicateGroups = useMemo(() => findDuplicateGroups(merged), [merged])

  // ---- Handlers ----
  function updateMeta(id, patch) {
    setMeta((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
  }

  function handleStatusChange(id, status) {
    updateMeta(id, { status })
  }

  function handleShowingChange(id, patch) {
    const next = { ...patch }
    // Setting a (non-empty) date auto-flips status to "Showing scheduled".
    if (Object.prototype.hasOwnProperty.call(patch, 'showingDate') && patch.showingDate) {
      next.status = 'Showing scheduled'
    }
    updateMeta(id, next)
  }

  function handleNotesChange(id, notes) {
    updateMeta(id, { notes })
  }

  // Manually force a listing's availability ('dead' | 'active') or clear the
  // override (null) to let the auto-check decide again.
  function handleMarketOverride(id, value) {
    updateMeta(id, { marketOverride: value })
    if (value === 'dead') showToast('Marked no longer available')
    else if (value === 'active') showToast('Marked available')
    else showToast('Back to auto-check')
  }

  // Returns false (and adds nothing) when the listing duplicates an existing one.
  function handleAdd(listing) {
    if (isDuplicateOf(listing, merged)) {
      showToast('Already on the list')
      return false
    }
    setCustom((prev) => [...prev, listing])
    markChecked(listing.id) // availability was verified during add
    showToast('Unit added')
    setTab('Listings')
    return true
  }

  // Re-fetch each added listing from its StreetEasy link: fix building-name
  // addresses (and re-geocode) and backfill any missing rent / beds / etc.
  // Never overwrites values that already exist.
  const [fixing, setFixing] = useState(false)
  const [fixMsg, setFixMsg] = useState('')
  async function handleFixAddresses() {
    const targets = custom.filter((l) => l.streeteasy_url)
    if (targets.length === 0) {
      showToast('No added listings to refresh')
      return
    }
    if (!window.confirm(`Refresh ${targets.length} added listing(s) from StreetEasy? Fixes addresses and fills any missing rent / beds / availability. Uses your scraping credits.`)) {
      return
    }
    const isBlank = (v) => v == null || v === ''
    setFixing(true)
    const updated = [...custom]
    let done = 0
    let changedCount = 0
    for (let i = 0; i < updated.length; i++) {
      const l = updated[i]
      if (!l.streeteasy_url) continue
      done++
      setFixMsg(`Checking ${done} of ${targets.length}…`)
      const result = await scrapeListing(l.streeteasy_url)
      const f = result && !result.blocked ? result.fields || {} : null
      if (!f) continue
      markChecked(l.id) // counts toward the 12h throttle

      const next = { ...l }
      let changed = false
      let addressChanged = false

      // Address: replace a building-name with the real street address.
      if (f.address && /\d/.test(f.address) && f.address !== l.address) {
        next.address = f.address
        changed = true
        addressChanged = true
      }
      // Backfill only when the field is currently empty (beds 0 = Studio counts).
      if (isBlank(l.base_rent) && f.base_rent != null) { next.base_rent = f.base_rent; changed = true }
      if (isBlank(l.net_effective_rent) && f.net_effective_rent != null) {
        next.net_effective_rent = f.net_effective_rent
        if (f.concession_note) next.concession_note = f.concession_note
        changed = true
      }
      if (isBlank(l.beds) && f.beds != null) { next.beds = f.beds; changed = true }
      if (isBlank(l.baths) && f.baths != null) { next.baths = f.baths; changed = true }
      if (isBlank(l.available) && f.available) { next.available = f.available; changed = true }
      if (isBlank(l.photo_url) && f.photo_url) { next.photo_url = f.photo_url; changed = true }
      if ((isBlank(l.neighborhood) || l.neighborhood === '—') && f.neighborhood) {
        next.neighborhood = f.neighborhood
        changed = true
      }
      // Re-check availability — but never override a manual setting.
      const overridden = meta[l.id] && meta[l.id].marketOverride
      if (!overridden && f.market_flag && (f.market_flag !== l.market_flag || f.market_status !== l.market_status)) {
        next.market_flag = f.market_flag
        next.market_status = f.market_status || next.market_status
        changed = true
      }

      // Re-geocode only when the address actually changed.
      if (addressChanged) {
        const geo = await geocodeWithFallback(next.address, next.borough)
        next.latitude = geo.latitude
        next.longitude = geo.longitude
      }

      if (changed) {
        updated[i] = next
        changedCount++
      }
    }
    setCustom(updated)
    setFixing(false)
    setFixMsg('')
    showToast(changedCount ? `Updated ${changedCount} listing${changedCount === 1 ? '' : 's'}` : 'Everything already up to date')
  }

  // Silent availability re-check of added listings (used by the on-load sweep).
  async function runAvailabilitySweep() {
    const list = customRef.current
    const targets = list.filter((l) => l.streeteasy_url)
    if (targets.length === 0) return
    const updated = [...list]
    let changed = false
    let flipped = 0
    for (let i = 0; i < updated.length; i++) {
      const l = updated[i]
      if (!l.streeteasy_url) continue
      // Don't touch listings you've set manually.
      if (metaRef.current[l.id] && metaRef.current[l.id].marketOverride) continue
      // Skip anything already checked within the last 12 hours.
      if (checkedRecently(l.id)) continue
      const r = await scrapeListing(l.streeteasy_url)
      const f = r && !r.blocked ? r.fields || {} : null
      if (!f) continue // couldn't check (blocked/offline) — don't mark as checked
      markChecked(l.id)
      if (f.market_flag && (f.market_flag !== l.market_flag || f.market_status !== l.market_status)) {
        if (f.market_flag === 'dead' && l.market_flag !== 'dead') flipped++
        updated[i] = { ...l, market_flag: f.market_flag, market_status: f.market_status || l.market_status }
        changed = true
      }
    }
    if (changed) {
      setCustom(updated)
      if (flipped) showToast(`${flipped} listing${flipped === 1 ? '' : 's'} no longer available`)
    }
  }

  // Run the availability sweep once per page load, after sync has settled.
  const autoCheckedRef = useRef(false)
  useEffect(() => {
    if (autoCheckedRef.current) return
    autoCheckedRef.current = true
    const t = setTimeout(() => {
      runAvailabilitySweep()
    }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Remove a user-added listing from the duplicates banner (with confirm).
  function confirmRemove(listing) {
    if (window.confirm(`Delete ${listing.address} ${listing.unit}? This cannot be undone.`)) {
      handleRemove(listing.id)
    }
  }

  function handleRemove(id) {
    setCustom((prev) => prev.filter((l) => l.id !== id))
    setMeta((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    showToast('Removed')
  }

  // Export / Import.
  const fileRef = useRef(null)
  function handleExport() {
    downloadExport()
    showToast('Exported')
  }
  function handleImportClick() {
    fileRef.current && fileRef.current.click()
  }
  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        const { meta: m, custom: c } = importData(parsed)
        setMeta(m)
        setCustom(c)
        showToast('Imported')
      } catch (err) {
        alert('Could not import file: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ---- Listings tab: filter + sort ----
  const visible = useMemo(() => {
    let list = merged.slice()
    if (boroughFilter !== 'All') list = list.filter((l) => l.borough === boroughFilter)
    if (statusFilter !== 'All') list = list.filter((l) => l.status === statusFilter)
    if (hideDead) list = list.filter((l) => l.market_flag !== 'dead')

    const statusOrder = (s) => {
      const i = STATUSES.indexOf(s)
      return i === -1 ? 99 : i
    }

    list.sort((a, b) => {
      if (sort === 'neighborhood') {
        return (a.neighborhood || '').localeCompare(b.neighborhood || '')
      }
      if (sort === 'status') {
        return statusOrder(a.status) - statusOrder(b.status)
      }
      // Net rent sorts: nulls always last.
      const ra = effectiveRent(a)
      const rb = effectiveRent(b)
      if (ra == null && rb == null) return 0
      if (ra == null) return 1
      if (rb == null) return -1
      return sort === 'net-asc' ? ra - rb : rb - ra
    })
    return list
  }, [merged, boroughFilter, statusFilter, hideDead, sort])

  const selectStyle = {
    padding: '7px 9px',
    border: '1px solid #aaa',
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'Helvetica, Arial, sans-serif',
    background: '#fff',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F2F2EF' }}>
      {/* Header band */}
      <header style={{ background: '#000', borderBottom: '6px solid #FCCC0A', padding: '12px 16px 14px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ color: '#A7A9AC', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
            CHARLES · NYC APARTMENT SEARCH
          </div>
          <div style={{ color: '#fff', fontSize: 26, fontWeight: 700, margin: '2px 0 8px', letterSpacing: '-0.01em' }}>
            Showing Tracker
          </div>
          <SubwayBullets lines={HEADER_LINES} size={24} />
        </div>
      </header>

      {/* Sticky tabs */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          background: '#fff',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', width: '100%' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '13px 6px',
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? '4px solid #FCCC0A' : '4px solid transparent',
                color: tab === t ? '#000' : '#888',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '16px 14px 40px' }}>
        {tab === 'Listings' && (
          <>
            {/* Filters + sort */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <select value={boroughFilter} onChange={(e) => setBoroughFilter(e.target.value)} style={selectStyle} aria-label="Borough filter">
                {BOROUGHS.map((b) => (
                  <option key={b} value={b}>
                    {b === 'All' ? 'All boroughs' : b}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle} aria-label="Status filter">
                <option value="All">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle} aria-label="Sort">
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    Sort: {s.label}
                  </option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: '#444' }}>
                <input type="checkbox" checked={hideDead} onChange={(e) => setHideDead(e.target.checked)} />
                Hide off-market
              </label>
            </div>

            <AddUnitForm onAdd={handleAdd} />

            <DuplicatesNotice groups={duplicateGroups} onRemove={confirmRemove} />

            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
              {visible.length} listing{visible.length === 1 ? '' : 's'}
            </div>

            {visible.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                onStatusChange={handleStatusChange}
                onShowingChange={handleShowingChange}
                onNotesChange={handleNotesChange}
                onMarketOverride={handleMarketOverride}
                onRemove={handleRemove}
                onToast={showToast}
              />
            ))}
          </>
        )}

        {tab === 'Map' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
                <input type="checkbox" checked={showSubway} onChange={(e) => setShowSubway(e.target.checked)} />
                Show subway lines &amp; stops
              </label>
            </div>
            <BigMap listings={merged} showSubway={showSubway} />
            <Legend />
          </>
        )}

        {tab === 'Schedule' && <ScheduleTab listings={merged} />}
      </main>

      {/* Footer: backup controls */}
      <footer style={{ borderTop: '1px solid #ddd', background: '#fff', padding: '16px 14px 26px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SyncBadge status={syncStatus} />
            {syncStatus === 'offline'
              ? 'Shared sync unavailable — saved on this device. Export a backup to be safe.'
              : 'Synced across devices. Export gives you a portable backup.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={handleExport} style={footerBtn}>
              Export JSON
            </button>
            <button onClick={handleImportClick} style={footerBtn}>
              Import JSON
            </button>
            <input ref={fileRef} type="file" accept="application/json" onChange={handleImportFile} style={{ display: 'none' }} />
            <button onClick={handleFixAddresses} disabled={fixing} style={{ ...footerBtn, background: '#0039A6', cursor: fixing ? 'wait' : 'pointer' }}>
              {fixing ? fixMsg || 'Refreshing…' : 'Refresh details from StreetEasy'}
            </button>
          </div>
        </div>
      </footer>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            background: '#00933C',
            color: '#fff',
            padding: '9px 16px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 13,
            zIndex: 2000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            fontFamily: 'Helvetica, Arial, sans-serif',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

const footerBtn = {
  background: '#000',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '9px 14px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'Helvetica, Arial, sans-serif',
}

// Yellow MTA-style warning listing duplicate apartments, with a delete button
// for each user-added copy.
function DuplicatesNotice({ groups, onRemove }) {
  if (!groups || groups.length === 0) return null
  return (
    <div
      style={{
        background: '#FCCC0A',
        border: '2px solid #000',
        borderRadius: 6,
        padding: '12px 14px',
        marginBottom: 16,
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#000' }}>
        ⚠ Possible duplicate{groups.length > 1 ? 's' : ''} — {groups.length} apartment
        {groups.length > 1 ? 's' : ''} listed more than once
      </div>
      {groups.map((g, i) => (
        <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid rgba(0,0,0,0.2)' : 'none' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#000' }}>
            {g[0].address} {g[0].unit}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
            {g.map((l, j) => (
              <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, color: '#000' }}>
                <span>
                  Copy {j + 1}: {l.neighborhood || '—'} ·{' '}
                  <strong>{l.user_added ? 'added by you' : 'original list'}</strong>
                </span>
                {l.user_added ? (
                  <button
                    onClick={() => onRemove(l)}
                    style={{
                      marginLeft: 'auto',
                      background: '#EE352E',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Delete this one
                  </button>
                ) : (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555' }}>(can't delete)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function SyncBadge({ status }) {
  const map = {
    synced: { color: '#00933C', label: 'Synced' },
    syncing: { color: '#0039A6', label: 'Syncing…' },
    offline: { color: '#808183', label: 'Local only' },
  }
  const s = map[status] || map.offline
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: s.color }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function Legend() {
  const items = [
    { label: 'Available', color: '#00933C', opacity: 1 },
    { label: 'Off-market / unavailable', color: '#808183', opacity: 0.55 },
    { label: 'Opted against', color: '#EE352E', opacity: 1 },
    { label: 'Added by you / verify', color: '#FCCC0A', opacity: 1 },
  ]
  return (
    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 14, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444' }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: it.color,
              opacity: it.opacity,
              border: '1.5px solid #000',
              display: 'inline-block',
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}
