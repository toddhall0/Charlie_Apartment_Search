import { useMemo, useState } from 'react'
import { haversine, nearestNeighborRoute } from '../lib/geo'

function transitDirUrl(a, b) {
  return `https://www.google.com/maps/dir/?api=1&origin=${a.latitude},${a.longitude}&destination=${b.latitude},${b.longitude}&travelmode=transit`
}

// Pick the starting stop: earliest appointment time; if no times, northernmost.
function pickStartIndex(stops) {
  const withTimes = stops.filter((s) => s.showingTime)
  if (withTimes.length) {
    let bestIdx = 0
    let bestTime = stops[0].showingTime || '99:99'
    stops.forEach((s, i) => {
      const t = s.showingTime || '99:99'
      if (t < bestTime) {
        bestTime = t
        bestIdx = i
      }
    })
    // Ensure the chosen index actually has a time; fall back to first-with-time.
    if (!stops[bestIdx].showingTime) {
      bestIdx = stops.findIndex((s) => s.showingTime)
    }
    return bestIdx
  }
  // Northernmost (highest latitude).
  let bestIdx = 0
  stops.forEach((s, i) => {
    if (s.latitude > stops[bestIdx].latitude) bestIdx = i
  })
  return bestIdx
}

export function RoutePlanner({ showings }) {
  const dates = useMemo(() => {
    const set = new Set(showings.map((s) => s.showingDate))
    return Array.from(set).sort()
  }, [showings])

  const [selectedDate, setSelectedDate] = useState('')

  const activeDate = selectedDate || dates[0] || ''
  const dayStops = useMemo(
    () => showings.filter((s) => s.showingDate === activeDate),
    [showings, activeDate]
  )

  const route = useMemo(() => {
    if (dayStops.length === 0) return []
    const startIdx = pickStartIndex(dayStops)
    return nearestNeighborRoute(dayStops, startIdx)
  }, [dayStops])

  if (dates.length === 0) {
    return (
      <p style={{ color: '#777', fontSize: 14 }}>
        No showings scheduled yet — set a date on a listing to build a route.
      </p>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#555', marginRight: 8 }}>Day</label>
        <select
          value={activeDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{
            padding: '7px 9px',
            border: '1px solid #aaa',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'Helvetica, Arial, sans-serif',
          }}
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        {route.map((stop, i) => {
          const next = route[i + 1]
          const dist = next ? haversine(stop, next) : null
          return (
            <div key={stop.id}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    flex: '0 0 auto',
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: '#0039A6',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {stop.showingTime ? stop.showingTime + ' · ' : ''}
                    {stop.address} {stop.unit}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{stop.neighborhood}</div>
                </div>
              </div>

              {next && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                  {/* vertical connector aligned under the badge */}
                  <div style={{ width: 26, display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 2, height: 28, background: '#0039A6' }} />
                  </div>
                  <a
                    href={transitDirUrl(stop, next)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0039A6',
                      textDecoration: 'none',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                    }}
                  >
                    ↓ Transit directions to stop {i + 2} ({dist.toFixed(1)} mi) ↗
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default RoutePlanner
