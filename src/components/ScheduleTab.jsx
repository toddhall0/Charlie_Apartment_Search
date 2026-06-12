import { useMemo } from 'react'
import RoutePlanner from './RoutePlanner'

function googleMapsSearchUrl(listing) {
  const q = `${listing.address}, ${listing.borough}, NY ${listing.zip || ''}`.trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

// Sort key: date then time (untimed entries sort after timed ones on a day).
function sortKey(s) {
  return `${s.showingDate} ${s.showingTime || '99:99'}`
}

const sectionTitle = {
  fontWeight: 700,
  fontSize: 16,
  margin: '0 0 12px',
  paddingBottom: 6,
  borderBottom: '3px solid #FCCC0A',
  fontFamily: 'Helvetica, Arial, sans-serif',
}

export function ScheduleTab({ listings }) {
  // Only listings that have a showing date.
  const showings = useMemo(
    () =>
      listings
        .filter((l) => l.showingDate)
        .slice()
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [listings]
  )

  return (
    <div style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <section style={{ marginBottom: 28 }}>
        <h2 style={sectionTitle}>All showings</h2>
        {showings.length === 0 ? (
          <p style={{ color: '#777', fontSize: 14 }}>
            No showings scheduled yet. Set a date on any listing card and it will appear here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {showings.map((s) => (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid #e5e5e2',
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {s.showingDate}
                  {s.showingTime ? ` · ${s.showingTime}` : ''}
                </span>
                <span style={{ color: '#ccc' }}>|</span>
                <span>
                  {s.address} {s.unit} <span style={{ color: '#777' }}>({s.neighborhood})</span>
                </span>
                <a
                  href={googleMapsSearchUrl(s)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginLeft: 'auto', fontWeight: 700, color: '#0039A6', textDecoration: 'none' }}
                >
                  Map ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 style={sectionTitle}>Route planner</h2>
        <RoutePlanner showings={showings} />
      </section>
    </div>
  )
}

export default ScheduleTab
