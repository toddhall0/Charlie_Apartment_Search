// iCalendar (.ics) generation, shared by the client (download) and the
// /api/calendar feed (subscription). Pure ESM, no browser/node-only deps.

function pad(n) {
  return String(n).padStart(2, '0')
}

// RFC 5545 text escaping for property values.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold long lines to <=75 octets with CRLF + leading space (approximated by
// character count, which is fine for our ASCII-dominant content).
function fold(line) {
  if (line.length <= 75) return line
  const out = [line.slice(0, 75)]
  let i = 75
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74))
    i += 74
  }
  return out.join('\r\n')
}

// UTC timestamp form: 20260620T143000Z
function utcStamp(d) {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function rentOf(l) {
  const r = l.net_effective_rent != null ? l.net_effective_rent : l.base_rent
  return r == null ? null : '$' + Number(r).toLocaleString('en-US')
}

// Build a VEVENT for one showing. Times are emitted as "floating" local time
// (no TZID/UTC) so they display at the wall-clock hour in the viewer's zone —
// correct for a single-city (NYC) search and free of DST/VTIMEZONE pitfalls.
function vevent(s, dtstamp) {
  const [y, m, d] = s.showingDate.split('-').map(Number)
  if (!y || !m || !d) return []
  const lines = ['BEGIN:VEVENT', 'UID:' + esc(s.id) + '@charlie-apartment-search', 'DTSTAMP:' + dtstamp]

  if (s.showingTime && /^\d{1,2}:\d{2}/.test(s.showingTime)) {
    const [hh, mm] = s.showingTime.split(':').map(Number)
    const start = `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`
    const e = new Date(y, m - 1, d, hh, mm + 30) // default 30-min showing
    const end = `${e.getFullYear()}${pad(e.getMonth() + 1)}${pad(e.getDate())}T${pad(e.getHours())}${pad(e.getMinutes())}00`
    lines.push('DTSTART:' + start, 'DTEND:' + end)
  } else {
    const nd = new Date(y, m - 1, d + 1)
    lines.push(
      'DTSTART;VALUE=DATE:' + `${y}${pad(m)}${pad(d)}`,
      'DTEND;VALUE=DATE:' + `${nd.getFullYear()}${pad(nd.getMonth() + 1)}${pad(nd.getDate())}`
    )
  }

  lines.push('SUMMARY:' + esc(`Showing: ${s.address} ${s.unit || ''}`.trim()))

  const loc = [s.address, s.unit, s.borough, s.zip ? 'NY ' + s.zip : 'NY'].filter(Boolean).join(', ')
  lines.push('LOCATION:' + esc(loc))

  const desc = []
  if (s.neighborhood) desc.push(`Neighborhood: ${s.neighborhood}`)
  const rent = rentOf(s)
  if (rent) desc.push(`Rent: ${rent}`)
  if (s.status) desc.push(`Status: ${s.status}`)
  if (s.agent) desc.push(`Agent: ${s.agent}`)
  if (s.commute_to_pace) desc.push(`Commute: ${s.commute_to_pace}`)
  if (s.streeteasy_url) desc.push(s.streeteasy_url)
  if (desc.length) lines.push('DESCRIPTION:' + esc(desc.join('\n')))
  if (s.streeteasy_url) lines.push('URL:' + esc(s.streeteasy_url))

  lines.push('END:VEVENT')
  return lines
}

// Build a full VCALENDAR string from showings (listings with a showingDate).
export function buildICS(showings, opts = {}) {
  const dtstamp = utcStamp(opts.now || new Date())
  let lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Charlie Apartment Search//Showings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Apartment Showings',
    'X-WR-TIMEZONE:America/New_York',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const s of showings) {
    if (s && s.showingDate) lines = lines.concat(vevent(s, dtstamp))
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export default buildICS
