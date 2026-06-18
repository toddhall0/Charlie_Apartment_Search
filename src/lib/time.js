// Format a 24-hour "HH:MM" time string (from <input type="time">) for display
// as 12-hour with AM/PM, e.g. "14:30" -> "2:30 PM". Returns the input
// unchanged if it isn't a parseable HH:MM value.
export function to12h(t) {
  if (!t) return ''
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return t
  let h = Number(m[1])
  const min = m[2]
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${min} ${ampm}`
}

export default to12h
