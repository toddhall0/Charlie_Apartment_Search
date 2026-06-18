import { useMemo, useState } from 'react'
import RoutePlanner from './RoutePlanner'
import CalendarView from './CalendarView'
import { buildICS } from '../lib/ics'
import { to12h } from '../lib/time'

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

function CalendarSync({ showings }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location : null
  const feedHttps = origin ? `${origin.origin}/api/calendar` : '/api/calendar'
  // webcal:// makes desktop/mobile calendars offer "Subscribe" directly.
  const feedWebcal = origin ? `webcal://${origin.host}/api/calendar` : feedHttps

  function downloadIcs() {
    const ics = buildICS(showings)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'apartment-showings.ics'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copyFeed() {
    try {
      await navigator.clipboard.writeText(feedHttps)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this calendar feed URL:', feedHttps)
    }
  }

  const btn = {
    border: '2px solid #000',
    background: '#FCCC0A',
    color: '#000',
    borderRadius: 4,
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    fontFamily: 'Helvetica, Arial, sans-serif',
  }
  const ghost = { ...btn, background: '#fff' }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
      <a href={feedWebcal} style={btn}>
        Subscribe in Calendar
      </a>
      <button onClick={downloadIcs} style={ghost} disabled={showings.length === 0}>
        Download .ics
      </button>
      <button onClick={copyFeed} style={ghost}>
        {copied ? 'Copied ✓' : 'Copy feed URL'}
      </button>
      <span style={{ fontSize: 11, color: '#888', flexBasis: '100%' }}>
        Subscribe keeps your calendar in sync (re-checks hourly). Download is a one-time import.
      </span>
    </div>
  )
}

export function ScheduleTab({ listings }) {
  const [view, setView] = useState('list') // 'list' | 'calendar'

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
      <CalendarSync showings={showings} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', border: '1px solid #aaa', borderRadius: 4, overflow: 'hidden' }}>
          {['list', 'calendar'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: view === v ? '#000' : '#fff',
                color: view === v ? '#FCCC0A' : '#444',
                fontFamily: 'Helvetica, Arial, sans-serif',
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'calendar' && (
        <section style={{ marginBottom: 28 }}>
          {showings.length === 0 ? (
            <p style={{ color: '#777', fontSize: 14 }}>
              No showings scheduled yet. Set a date on any listing card and it will appear here.
            </p>
          ) : (
            <CalendarView showings={showings} />
          )}
        </section>
      )}

      <section style={{ marginBottom: 28, display: view === 'list' ? 'block' : 'none' }}>
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
                  {s.showingTime ? ` · ${to12h(s.showingTime)}` : ''}
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
