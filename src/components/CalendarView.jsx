import { useMemo, useState } from 'react'
import { statusColor } from '../constants'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function pad(n) {
  return String(n).padStart(2, '0')
}
function dateStr(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

const navBtn = {
  border: '1px solid #aaa',
  background: '#fff',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'Helvetica, Arial, sans-serif',
}

export function CalendarView({ showings }) {
  // Group showings by their date string for quick per-day lookup.
  const byDate = useMemo(() => {
    const map = {}
    for (const s of showings) {
      if (!s.showingDate) continue
      ;(map[s.showingDate] = map[s.showingDate] || []).push(s)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.showingTime || '99:99').localeCompare(b.showingTime || '99:99'))
    }
    return map
  }, [showings])

  // Open on the month of the next upcoming showing (or the earliest, else now).
  const initial = useMemo(() => {
    const today = new Date()
    const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate())
    const dates = Object.keys(byDate).sort()
    const target = dates.find((d) => d >= todayStr) || dates[0]
    if (target) {
      const [y, m] = target.split('-').map(Number)
      return { y, m: m - 1 }
    }
    return { y: today.getFullYear(), m: today.getMonth() }
  }, [byDate])

  const [cursor, setCursor] = useState(initial)
  const { y, m } = cursor

  const today = new Date()
  const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate())

  const firstWeekday = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const weeks = Math.ceil((firstWeekday + daysInMonth) / 7)

  function shift(delta) {
    const nm = m + delta
    setCursor({ y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 })
  }

  const cells = []
  for (let i = 0; i < weeks * 7; i++) {
    const dayNum = i - firstWeekday + 1
    cells.push(dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null)
  }

  return (
    <div style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button style={navBtn} onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {MONTHS[m]} {y}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={navBtn} onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>
            Today
          </button>
          <button style={navBtn} onClick={() => shift(1)} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#ddd', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ background: '#000', color: '#FCCC0A', fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '6px 0', letterSpacing: '0.03em' }}>
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          const ds = day ? dateStr(y, m, day) : null
          const items = ds ? byDate[ds] || [] : []
          const isToday = ds === todayStr
          return (
            <div
              key={i}
              style={{
                background: day ? (isToday ? '#fffae6' : '#fff') : '#f4f4f2',
                minHeight: 74,
                padding: 4,
                verticalAlign: 'top',
              }}
            >
              {day && (
                <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#0039A6' : '#999', marginBottom: 2, textAlign: 'right' }}>
                  {isToday ? '● ' : ''}
                  {day}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {items.map((s) => {
                  const chip = (
                    <div
                      style={{
                        background: statusColor(s.status),
                        color: '#fff',
                        borderRadius: 3,
                        padding: '2px 4px',
                        fontSize: 10,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${s.showingTime ? s.showingTime + ' · ' : ''}${s.address} ${s.unit || ''} (${s.neighborhood || ''})`}
                    >
                      {s.showingTime ? <strong>{s.showingTime} </strong> : null}
                      {s.address}
                    </div>
                  )
                  return s.streeteasy_url ? (
                    <a key={s.id} href={s.streeteasy_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      {chip}
                    </a>
                  ) : (
                    <div key={s.id}>{chip}</div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarView
