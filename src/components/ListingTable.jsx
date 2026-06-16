import { STATUSES, statusColor } from '../constants'
import RankSelect from './RankSelect'

function money(n) {
  return n == null ? '—' : '$' + Number(n).toLocaleString('en-US')
}

function bedsLabel(beds) {
  if (beds == null) return '—'
  if (beds === 0) return 'Studio'
  return String(beds)
}

// Market availability dot color (matches the map scheme).
function marketColor(listing) {
  if (listing.status === 'Passed') return '#EE352E'
  if (listing.market_flag === 'dead') return '#808183'
  if (listing.market_flag === 'active') return '#00933C'
  return '#FCCC0A'
}

function commuteText(l) {
  if (l.commute_to_pace) return l.commute_to_pace
  if (l.transit_estimate) return `${l.transit_estimate} (est.)`
  return '—'
}

const th = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: '#fff',
  background: '#000',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
}

const td = {
  padding: '8px 10px',
  fontSize: 13,
  borderBottom: '1px solid #e5e5e2',
  verticalAlign: 'top',
}

export function ListingTable({ listings, onStatusChange, onSetRank, rankedCount }) {
  if (!listings.length) {
    return <div style={{ fontSize: 13, color: '#888' }}>No listings match your filters.</div>
  }
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <thead>
          <tr>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>Rank</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>Address</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>Neighborhood</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>Bd/Ba</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>Base</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>Net eff.</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>Available</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>→ Pace</th>
            <th style={{ ...th, borderBottom: '3px solid #FCCC0A' }}>My status</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const isDead = l.market_flag === 'dead'
            return (
              <tr key={l.id} style={{ opacity: isDead ? 0.6 : 1 }}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <RankSelect
                    rank={l.rank}
                    rankedCount={rankedCount}
                    compact
                    onSetRank={(v) => onSetRank(l.id, v)}
                  />
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span
                      title={l.market_status}
                      style={{ width: 11, height: 11, borderRadius: '50%', background: marketColor(l), border: '1.5px solid #000', flex: '0 0 auto' }}
                    />
                    <span>
                      {l.streeteasy_url ? (
                        <a href={l.streeteasy_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: '#111', textDecoration: 'none' }}>
                          {l.address} {l.unit}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 700 }}>{l.address} {l.unit}</span>
                      )}
                    </span>
                  </div>
                </td>
                <td style={{ ...td, color: '#555', whiteSpace: 'nowrap' }}>
                  {l.neighborhood}
                  <div style={{ fontSize: 11, color: '#999' }}>{l.borough}</div>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {bedsLabel(l.beds)}
                  {l.baths != null ? ` / ${l.baths}` : ''}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{money(l.base_rent)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap', color: l.net_effective_rent != null ? '#0a7a31' : '#111', fontWeight: l.net_effective_rent != null ? 700 : 400 }}>
                  {money(l.net_effective_rent)}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.available || (isDead ? 'Off-market' : '—')}</td>
                <td style={{ ...td, color: '#0039A6', fontSize: 12 }}>{commuteText(l)}</td>
                <td style={td}>
                  <select
                    value={l.status}
                    onChange={(e) => onStatusChange(l.id, e.target.value)}
                    aria-label="Tracking status"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 6px',
                      borderRadius: 4,
                      border: '2px solid ' + statusColor(l.status),
                      background: '#fff',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                    }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default ListingTable
