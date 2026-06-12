// The three-cell bordered rent strip. Wraps on narrow screens.

function money(n) {
  if (n == null) return null
  return '$' + Number(n).toLocaleString('en-US') + '/mo'
}

const cellBase = {
  flex: '1 1 140px',
  minWidth: 0,
  border: '1px solid #000',
  padding: '8px 10px',
  boxSizing: 'border-box',
  fontFamily: 'Helvetica, Arial, sans-serif',
}

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: '#555',
  textTransform: 'uppercase',
  marginBottom: 4,
}

const valueStyle = {
  fontSize: 18,
  fontWeight: 700,
  color: '#111',
}

const noteStyle = {
  fontSize: 11,
  color: '#444',
  marginTop: 3,
  lineHeight: 1.25,
}

export function RentStrip({ listing }) {
  const { base_rent, net_effective_rent, concession_note, available, market_flag } = listing
  const isDead = market_flag === 'dead'
  const seUrl = listing.streeteasy_url

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', margin: '10px 0', gap: 0 }}>
      {/* Advertised base rent */}
      <div style={cellBase}>
        <div style={labelStyle}>Advertised base rent</div>
        {base_rent != null ? (
          <div style={valueStyle}>{money(base_rent)}</div>
        ) : (
          <div style={valueStyle}>
            —{' '}
            {seUrl && (
              <a href={seUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600 }}>
                Check listing ↗
              </a>
            )}
          </div>
        )}
      </div>

      {/* Net effective rent */}
      <div
        style={{
          ...cellBase,
          background:
            net_effective_rent != null ? '#E3F4E7' : '#F4F4F2',
        }}
      >
        <div style={labelStyle}>Net effective rent</div>
        {net_effective_rent != null ? (
          <>
            <div style={{ ...valueStyle, color: '#0a7a31' }}>{money(net_effective_rent)}</div>
            {concession_note && <div style={{ ...noteStyle, color: '#0a7a31' }}>{concession_note}</div>}
          </>
        ) : base_rent != null ? (
          <>
            <div style={{ ...valueStyle, color: '#888' }}>{money(base_rent)}</div>
            <div style={noteStyle}>No concession advertised — confirm at showing</div>
          </>
        ) : (
          <div style={{ ...valueStyle, color: '#888' }}>—</div>
        )}
      </div>

      {/* Available */}
      <div style={cellBase}>
        <div style={labelStyle}>Available</div>
        {available ? (
          <div style={valueStyle}>{available}</div>
        ) : isDead ? (
          <div style={valueStyle}>
            — <span style={{ fontSize: 12, fontWeight: 600, color: '#EE352E' }}>Off-market</span>
          </div>
        ) : (
          <div style={valueStyle}>
            {seUrl ? (
              <a href={seUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>
                Check listing ↗
              </a>
            ) : (
              '—'
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RentStrip
