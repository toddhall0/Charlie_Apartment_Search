import { useState } from 'react'
import { parseStreetEasyUrl, geocodeWithFallback } from '../lib/geo'

const BOROUGHS = ['Brooklyn', 'Manhattan', 'Queens', 'Bronx', 'Staten Island']
const BEDS_OPTIONS = [
  { label: 'Studio', value: '0' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
]

const inputStyle = {
  width: '100%',
  padding: '7px 9px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'Helvetica, Arial, sans-serif',
  boxSizing: 'border-box',
}

const labelStyle = { fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 3, display: 'block' }

function slugId(address, unit) {
  const base = `${address} ${unit}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `custom-${base}-${Date.now().toString(36)}`
}

export function AddUnitForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [address, setAddress] = useState('')
  const [unit, setUnit] = useState('')
  const [borough, setBorough] = useState('Brooklyn')
  const [neighborhood, setNeighborhood] = useState('')
  const [baseRent, setBaseRent] = useState('')
  const [netRent, setNetRent] = useState('')
  const [beds, setBeds] = useState('0')
  const [baths, setBaths] = useState('1')
  const [available, setAvailable] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function handleUrlChange(e) {
    const value = e.target.value
    setUrl(value)
    const parsed = parseStreetEasyUrl(value)
    if (parsed) {
      if (parsed.address) setAddress(parsed.address)
      if (parsed.unit) setUnit(parsed.unit)
      if (parsed.borough) setBorough(parsed.borough)
    }
  }

  function reset() {
    setUrl('')
    setAddress('')
    setUnit('')
    setNeighborhood('')
    setBaseRent('')
    setNetRent('')
    setBeds('0')
    setBaths('1')
    setAvailable('')
    setMsg('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!address.trim()) {
      setMsg('Address is required.')
      return
    }
    setBusy(true)
    setMsg('Geocoding…')
    const geo = await geocodeWithFallback(address.trim(), borough)
    const baseNum = baseRent === '' ? null : Number(baseRent)
    const netNum = netRent === '' ? null : Number(netRent)

    const listing = {
      id: slugId(address.trim(), unit.trim()),
      address: address.trim(),
      unit: unit.trim(),
      neighborhood: neighborhood.trim() || '—',
      borough,
      zip: '',
      base_rent: Number.isFinite(baseNum) ? baseNum : null,
      net_effective_rent: Number.isFinite(netNum) ? netNum : null,
      concession_note: null,
      beds: Number(beds),
      baths: baths === '' ? null : Number(baths),
      available: available.trim() || null,
      market_status: geo.approximate
        ? 'Added by you · verify (pin approximate)'
        : 'Added by you · verify',
      market_flag: 'verify',
      subway_access: [],
      commute_to_pace: null,
      amenities: [],
      agent: null,
      photo_url: null,
      latitude: geo.latitude,
      longitude: geo.longitude,
      streeteasy_url: parseStreetEasyUrl(url)?.url || (url.trim() || null),
      user_added: true,
    }

    onAdd(listing)
    setBusy(false)
    reset()
    setOpen(false)
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 6,
        marginBottom: 16,
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#000',
          color: '#FCCC0A',
          border: 'none',
          padding: '11px 14px',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          borderRadius: open ? '6px 6px 0 0' : 6,
        }}
      >
        {open ? '–' : '+'} Add a unit from a StreetEasy link
      </button>

      {open && (
        <form onSubmit={handleSubmit} style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div>
            <label style={labelStyle}>StreetEasy URL (auto-fills address / unit / borough)</label>
            <input
              type="text"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://streeteasy.com/building/…-brooklyn/4b"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              The page itself can't be scraped (CORS / bot protection) — fill the rest manually.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Unit</label>
              <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="#4B" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Borough</label>
              <select value={borough} onChange={(e) => setBorough(e.target.value)} style={inputStyle}>
                {BOROUGHS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Neighborhood</label>
              <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Base rent ($/mo)</label>
              <input type="number" value={baseRent} onChange={(e) => setBaseRent(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Net effective rent ($/mo)</label>
              <input type="number" value={netRent} onChange={(e) => setNetRent(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Beds</label>
              <select value={beds} onChange={(e) => setBeds(e.target.value)} style={inputStyle}>
                {BEDS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Baths</label>
              <input type="number" min="0" step="0.5" value={baths} onChange={(e) => setBaths(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Available</label>
              <input type="text" value={available} onChange={(e) => setAvailable(e.target.value)} placeholder="Now" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="submit"
              disabled={busy}
              style={{
                background: '#0039A6',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '9px 16px',
                fontWeight: 700,
                fontSize: 13,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? 'Adding…' : 'Add unit'}
            </button>
            {msg && <span style={{ fontSize: 12, color: '#555' }}>{msg}</span>}
          </div>
        </form>
      )}
    </div>
  )
}

export default AddUnitForm
