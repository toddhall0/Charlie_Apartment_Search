import { useEffect, useRef, useState } from 'react'
import { SubwayBullets } from './SubwayBullet'
import RentStrip from './RentStrip'
import MiniMap from './MiniMap'
import { STATUSES, statusColor } from '../constants'

function googleMapsSearchUrl(listing) {
  const q = `${listing.address}, ${listing.borough}, NY ${listing.zip || ''}`.trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function bedsLabel(beds) {
  if (beds == null) return '—'
  if (beds === 0) return 'Studio'
  return `${beds} bd`
}

function bathsLabel(baths) {
  if (baths == null) return ''
  return ` · ${baths} ba`
}

// Black "station sign" banner shown when there's no photo or it fails to load.
function StationSignBanner({ listing }) {
  const isDead = listing.market_flag === 'dead'
  return (
    <div
      style={{
        background: '#000',
        color: '#fff',
        padding: '18px 14px',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 8,
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        {listing.address} {listing.unit}
      </div>
      <SubwayBullets lines={(listing.subway_access || []).flatMap((s) => s.lines)} size={22} />
      {isDead ? (
        <span style={{ color: '#A7A9AC', fontWeight: 700, fontSize: 13 }}>Listing off-market</span>
      ) : (
        <a
          href={listing.streeteasy_url}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#FCCC0A', fontWeight: 700, fontSize: 13 }}
        >
          View photos on StreetEasy ↗
        </a>
      )}
    </div>
  )
}

function Photo({ listing }) {
  const [failed, setFailed] = useState(false)
  if (!listing.photo_url || failed) {
    return <StationSignBanner listing={listing} />
  }
  return (
    <img
      src={listing.photo_url}
      alt={`${listing.address} ${listing.unit}`}
      onError={() => setFailed(true)}
      style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
    />
  )
}

function MarketPill({ listing }) {
  const flag = listing.market_flag
  let bg = '#00933C'
  let fg = '#fff'
  if (flag === 'dead') {
    bg = '#EE352E'
  } else if (flag === 'verify') {
    bg = '#FCCC0A'
    fg = '#000'
  }
  return (
    <span
      style={{
        display: 'inline-block',
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 9px',
        borderRadius: 999,
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      {listing.market_status}
    </span>
  )
}

const btnBase = {
  display: 'inline-block',
  padding: '7px 11px',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: 'none',
  fontFamily: 'Helvetica, Arial, sans-serif',
  cursor: 'pointer',
  border: 'none',
  textAlign: 'center',
}

export function ListingCard({ listing, onStatusChange, onShowingChange, onNotesChange, onRemove, onMarketOverride, onToast }) {
  const isDead = listing.market_flag === 'dead'
  const status = listing.status
  const borderColor = isDead ? '#808183' : statusColor(status)

  // Debounced notes editing.
  const [notes, setNotes] = useState(listing.notes || '')
  const firstRun = useRef(true)
  const lastSaved = useRef(listing.notes || '')

  // Keep local notes in sync if the listing changes (e.g. import).
  useEffect(() => {
    setNotes(listing.notes || '')
    lastSaved.current = listing.notes || ''
    firstRun.current = true
  }, [listing.id])

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (notes === lastSaved.current) return
    const t = setTimeout(() => {
      lastSaved.current = notes
      onNotesChange(listing.id, notes)
      onToast && onToast('Saved')
    }, 600)
    return () => clearTimeout(t)
  }, [notes])

  function handleStatus(e) {
    onStatusChange(listing.id, e.target.value)
  }

  function handleShowingDate(e) {
    onShowingChange(listing.id, { showingDate: e.target.value })
  }

  function handleShowingTime(e) {
    onShowingChange(listing.id, { showingTime: e.target.value })
  }

  function clearShowing() {
    onShowingChange(listing.id, { showingDate: '', showingTime: '' })
  }

  function handleRemove() {
    if (window.confirm(`Remove ${listing.address} ${listing.unit}? This cannot be undone.`)) {
      onRemove(listing.id)
    }
  }

  return (
    <div
      style={{
        background: '#fff',
        borderLeft: `8px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        marginBottom: 16,
        opacity: isDead ? 0.65 : 1,
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      <Photo listing={listing} />

      <div style={{ padding: '12px 14px' }}>
        {/* Address row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>
              {listing.address} {listing.unit}
            </div>
            <div style={{ color: '#555', fontSize: 13, marginTop: 2 }}>
              {listing.neighborhood} · {listing.borough} · {listing.zip}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {bedsLabel(listing.beds)}
            {bathsLabel(listing.baths)}
          </div>
        </div>

        <RentStrip listing={listing} />

        <div style={{ margin: '6px 0 10px' }}>
          <MarketPill listing={listing} />
          {listing.user_added && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#0039A6' }}>● Added by you</span>
          )}
          <div style={{ marginTop: 7, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {isDead ? (
              <button
                onClick={() => onMarketOverride(listing.id, 'active')}
                style={{ ...btnBase, background: '#fff', color: '#00933C', border: '2px solid #00933C' }}
              >
                Mark available
              </button>
            ) : (
              <button
                onClick={() => onMarketOverride(listing.id, 'dead')}
                style={{ ...btnBase, background: '#fff', color: '#EE352E', border: '2px solid #EE352E' }}
              >
                Mark no longer available
              </button>
            )}
            {listing.marketOverride && (
              <button
                onClick={() => onMarketOverride(listing.id, null)}
                style={{ ...btnBase, background: '#f2f2f2', color: '#333', border: '1px solid #aaa' }}
                title="Stop overriding and let the auto-check decide"
              >
                ↺ Auto
              </button>
            )}
            {listing.marketOverride && (
              <span style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>set manually</span>
            )}
          </div>
        </div>

        {/* Subway rows */}
        <div style={{ marginBottom: 10 }}>
          {(listing.subway_access || []).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <SubwayBullets lines={s.lines} size={20} />
              <span style={{ fontSize: 13 }}>{s.station}</span>
              <span style={{ fontSize: 12, color: '#777' }}>· {s.distance}</span>
            </div>
          ))}
          {listing.commute_to_pace ? (
            <div style={{ color: '#0039A6', fontWeight: 700, fontSize: 13, marginTop: 4 }}>
              → Pace: {listing.commute_to_pace}
            </div>
          ) : listing.transit_estimate ? (
            <div style={{ color: '#0039A6', fontWeight: 700, fontSize: 13, marginTop: 4 }}>
              → Pace: {listing.transit_estimate}{' '}
              <span style={{ fontWeight: 400, color: '#888' }}>(subway, est.)</span>
            </div>
          ) : null}
        </div>

        <MiniMap listing={listing} />

        {/* Amenities + agent */}
        {listing.amenities && listing.amenities.length > 0 && (
          <div style={{ fontSize: 12, color: '#444', marginTop: 10, lineHeight: 1.4 }}>
            {listing.amenities.join(' · ')}
          </div>
        )}
        {listing.agent && (
          <div style={{ fontSize: 12, color: '#777', marginTop: 6, fontStyle: 'italic' }}>{listing.agent}</div>
        )}

        {/* Controls row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
          {listing.streeteasy_url && (
            <a href={listing.streeteasy_url} target="_blank" rel="noreferrer" style={{ ...btnBase, background: '#000', color: '#fff' }}>
              StreetEasy ↗
            </a>
          )}
          <a href={googleMapsSearchUrl(listing)} target="_blank" rel="noreferrer" style={{ ...btnBase, background: '#0039A6', color: '#fff' }}>
            Google Maps ↗
          </a>
          <select
            value={status}
            onChange={handleStatus}
            aria-label="Tracking status"
            style={{
              ...btnBase,
              background: '#fff',
              color: '#111',
              border: '2px solid ' + statusColor(status),
              padding: '6px 8px',
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {listing.user_added && (
            <button onClick={handleRemove} style={{ ...btnBase, background: '#fff', color: '#EE352E', border: '2px solid #EE352E' }}>
              Remove
            </button>
          )}
        </div>

        {/* Showing row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>Showing</label>
          <input
            type="date"
            value={listing.showingDate || ''}
            onChange={handleShowingDate}
            aria-label="Showing date"
            style={{ ...btnBase, background: '#fff', color: '#111', border: '1px solid #aaa', padding: '6px 8px' }}
          />
          <input
            type="time"
            value={listing.showingTime || ''}
            onChange={handleShowingTime}
            aria-label="Showing time"
            style={{ ...btnBase, background: '#fff', color: '#111', border: '1px solid #aaa', padding: '6px 8px' }}
          />
          {listing.showingDate && (
            <button onClick={clearShowing} style={{ ...btnBase, background: '#f2f2f2', color: '#333', border: '1px solid #aaa' }}>
              Clear
            </button>
          )}
        </div>

        {/* Notes */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (auto-saved)…"
          rows={2}
          style={{
            width: '100%',
            marginTop: 10,
            padding: 8,
            border: '1px solid #ccc',
            borderRadius: 4,
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: 13,
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      </div>
    </div>
  )
}

export default ListingCard
