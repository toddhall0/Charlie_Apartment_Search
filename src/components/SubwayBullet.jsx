import { lineColor } from '../constants'

// A single MTA-style route bullet: a colored circle with a bold line letter.
export function SubwayBullet({ line, size = 22 }) {
  const { bg, fg } = lineColor(line)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: fg,
        fontWeight: 700,
        fontSize: size * 0.6,
        lineHeight: 1,
        fontFamily: 'Helvetica, Arial, sans-serif',
        flex: '0 0 auto',
      }}
      aria-label={`${line} train`}
    >
      {String(line).toUpperCase()}
    </span>
  )
}

// A row of bullets for a list of lines.
export function SubwayBullets({ lines, size = 22, gap = 3 }) {
  return (
    <span style={{ display: 'inline-flex', gap, flexWrap: 'wrap', verticalAlign: 'middle' }}>
      {(lines || []).map((line, i) => (
        <SubwayBullet key={`${line}-${i}`} line={line} size={size} />
      ))}
    </span>
  )
}

export default SubwayBullet
