import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { statusColor } from '../constants'

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
  return `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;min-width:170px">
      <div style="font-weight:700">${listing.address} ${listing.unit || ''}</div>
      <div style="color:#444;margin:3px 0">${listing.neighborhood} · ${price}</div>
      <div style="color:#444;margin-bottom:5px">${listing.market_status || ''}</div>
      <div style="display:flex;gap:10px">${se} ${gm}</div>
    </div>`
}

// Full-width interactive map. Markers recolor live as statuses change.
export function BigMap({ listings, height = '70vh' }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})

  // Initialize the map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const map = L.map(elRef.current, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)
    mapRef.current = map
    // Default view (NYC) until bounds are fit.
    map.setView([40.7, -73.95], 11)
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = {}
    }
  }, [])

  // Sync markers whenever listings (or their statuses) change.
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
      const color = isDead ? '#808183' : statusColor(listing.status)
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

    // Remove markers for listings that no longer exist.
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
