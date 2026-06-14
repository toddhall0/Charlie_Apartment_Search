// Shared design-system constants: MTA line colors and tracking-status colors.

// MTA subway line -> { bg, fg } colors.
export const LINE_COLORS = {
  '1': { bg: '#EE352E', fg: '#FFFFFF' },
  '2': { bg: '#EE352E', fg: '#FFFFFF' },
  '3': { bg: '#EE352E', fg: '#FFFFFF' },
  '4': { bg: '#00933C', fg: '#FFFFFF' },
  '5': { bg: '#00933C', fg: '#FFFFFF' },
  '6': { bg: '#00933C', fg: '#FFFFFF' },
  '7': { bg: '#B933AD', fg: '#FFFFFF' },
  A: { bg: '#0039A6', fg: '#FFFFFF' },
  C: { bg: '#0039A6', fg: '#FFFFFF' },
  E: { bg: '#0039A6', fg: '#FFFFFF' },
  B: { bg: '#FF6319', fg: '#FFFFFF' },
  D: { bg: '#FF6319', fg: '#FFFFFF' },
  F: { bg: '#FF6319', fg: '#FFFFFF' },
  M: { bg: '#FF6319', fg: '#FFFFFF' },
  N: { bg: '#FCCC0A', fg: '#000000' },
  Q: { bg: '#FCCC0A', fg: '#000000' },
  R: { bg: '#FCCC0A', fg: '#000000' },
  W: { bg: '#FCCC0A', fg: '#000000' },
  G: { bg: '#6CBE45', fg: '#FFFFFF' },
  S: { bg: '#808183', fg: '#FFFFFF' },
  L: { bg: '#A7A9AC', fg: '#FFFFFF' },
  J: { bg: '#996633', fg: '#FFFFFF' },
  Z: { bg: '#996633', fg: '#FFFFFF' },
}

export function lineColor(line) {
  return LINE_COLORS[String(line).toUpperCase()] || { bg: '#000000', fg: '#FFFFFF' }
}

// Tracking statuses (reuse subway colors).
export const STATUSES = ['New', 'Interested', 'Showing scheduled', 'Applied', 'Passed']

export const STATUS_COLORS = {
  New: '#808183',
  Interested: '#00933C',
  'Showing scheduled': '#0039A6',
  Applied: '#FF6319',
  Passed: '#EE352E',
}

export function statusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.New
}

export const DEFAULT_STATUS = 'New'

// A few representative lines for the header bullet row.
export const HEADER_LINES = ['2', '5', 'A', 'C', 'F', 'Q', 'G']
