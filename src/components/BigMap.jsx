import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { lineColor } from '../constants'

// Map marker color reflects availability + decision (not tracking status):
//   opted against (Passed) -> red, off-market -> grey, available -> green,
//   anything else (e.g. user-added / needs verifying) -> yellow.
function mapColor(listing) {
  if (listing.status === 'Passed') return '#EE352E'
  if (listing.market_flag === 'dead') return '#808183'
  if (listing.market_flag === 'active') return '#00933C'
  return '#FCCC0A'
}

function googleMapsSearchUrl(listing) {
  const q = `${listing.address}, ${listing.borough}, NY ${listing.zip || ''}`.trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function popupHtml(listing) {
  const price =
    listing.net_effective_rent != null
      ? '$' + listing.net_effective_rent.toLocaleString('en-US') + '/mo net'
      : listing.base_rent != null
      ? '$' + listing.base_rent.toLocaleString('en-US') + '/mo'
      : 'Price —'
  const se = listing.streeteasy_url
    ? `<a href="${listing.streeteasy_url}" target="_blank" rel="noreferrer">StreetEasy ↗</a>`
    : ''
  const gm = `<a href="${googleMapsSearchUrl(listing)}" target="_blank" rel="noreferrer">Google Maps ↗</a>`
  const commute = listing.commute_to_pace || (listing.transit_estimate ? listing.transit_estimate + ' (est.)' : '')
  const commuteRow = commute
    ? `<div style="color:#0039A6;font-weight:700;margin-bottom:5px">→ Pace: ${commute}</div>`
    : ''
  return `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;min-width:170px">
      <div style="font-weight:700">${listing.address} ${listing.unit || ''}</div>
      <div style="color:#444;margin:3px 0">${listing.neighborhood} · ${price}</div>
      <div style="color:#444;margin-bottom:5px">${listing.market_status || ''}</div>
      ${commuteRow}
      <div style="display:flex;gap:10px">${se} ${gm}</div>
    </div>`
}

// Cache the subway data across mounts so we only fetch it once.
let subwayCache = null

// Full-width interactive map. Markers recolor live as statuses change, with the
// NYC subway lines + stops drawn underneath.
export function BigMap({ listings, showSubway = true, height = '70vh' }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const subwayLayerRef = useRef(null)

  // Initialize the map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    // Dedicated pane for the subway overlay, kept below listing markers.
    map.createPane('subwayPane')
    map.getPane('subwayPane').style.zIndex = 350

    mapRef.current = map
    map.setView([40.7, -73.95], 11)
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = {}
      subwayLayerRef.current = null
    }
  }, [])

  // Load + draw the subway overlay (once data is available and toggle is on).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let cancelled = false

    function draw(data) {
      if (cancelled || !mapRef.current) return
      // Remove any existing overlay first.
      if (subwayLayerRef.current) {
        map.removeLayer(subwayLayerRef.current)
        subwayLayerRef.current = null
      }
      if (!showSubway) return

      const group = L.layerGroup([], { pane: 'subwayPane' })

      // Lines: one colored polyline per segment, colored by trunk symbol.
      data.lines.forEach((line) => {
        const color = lineColor(line.sym).bg
        line.segs.forEach((seg) => {
          // seg is [[lng,lat], ...] -> Leaflet wants [lat,lng]
          const latlngs = seg.map((c) => [c[1], c[0]])
          L.polyline(latlngs, {
            pane: 'subwayPane',
            color,
            weight: 3,
            opacity: 0.75,
            interactive: false,
          }).addTo(group)
        })
      })

      // Stations: small white dots with a name + line popup.
      data.stations.forEach((st) => {
        const m = L.circleMarker([st.c[1], st.c[0]], {
          pane: 'subwayPane',
          radius: 2.5,
          color: '#333',
          weight: 1,
          fillColor: '#fff',
          fillOpacity: 1,
        })
        const bullets = st.l
          .map((ln) => {
            const c = lineColor(ln)
            return `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:${c.bg};color:${c.fg};font-size:10px;font-weight:700;margin-right:2px">${ln}</span>`
          })
          .join('')
        m.bindPopup(
          `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px"><strong>${st.n}</strong><br/><span style="display:inline-flex;margin-top:3px">${bullets}</span></div>`
        )
        m.addTo(group)
      })

      group.addTo(map)
      subwayLayerRef.current = group
    }

    if (subwayCache) {
      draw(subwayCache)
    } else if (showSubway) {
      fetch('/subway.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return
          subwayCache = data
          draw(data)
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [showSubway])

  // Sync listing markers whenever listings (or their statuses) change.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set()
    const pts = []

    listings.forEach((listing) => {
      if (listing.latitude == null || listing.longitude == null) return
      seen.add(listing.id)
      pts.push([listing.latitude, listing.longitude])
      const isDead = listing.market_flag === 'dead'
      const color = mapColor(listing)
      const opacity = isDead ? 0.55 : 0.95

      let marker = markersRef.current[listing.id]
      if (!marker) {
        marker = L.circleMarker([listing.latitude, listing.longitude], {
          radius: 10,
          color: '#000',
          weight: 1.5,
        })
        marker.addTo(map)
        markersRef.current[listing.id] = marker
      }
      marker.setLatLng([listing.latitude, listing.longitude])
      marker.setStyle({ fillColor: color, fillOpacity: opacity, opacity: isDead ? 0.7 : 1 })
      marker.bindPopup(popupHtml(listing))
    })

    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(id)) {
        map.removeLayer(markersRef.current[id])
        delete markersRef.current[id]
      }
    })

    if (pts.length) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 })
    }
  }, [listings])

  return (
    <div ref={elRef} style={{ height, width: '100%', borderRadius: 6, overflow: 'hidden' }} />
  )
}

export default BigMap
