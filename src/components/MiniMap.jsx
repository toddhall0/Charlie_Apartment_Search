import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Google Maps directions URL to a lat/lng destination.
function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`
}

// A small, non-interactive Leaflet map centered on the unit, wrapped in an
// anchor that opens Google Maps directions.
export function MiniMap({ listing, height = 130 }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const { latitude, longitude } = listing
    if (latitude == null || longitude == null) return

    const map = L.map(elRef.current, {
      center: [latitude, longitude],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,
      touchZoom: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)
    L.circleMarker([latitude, longitude], {
      radius: 8,
      color: '#0039A6',
      weight: 2,
      fillColor: '#1f6fff',
      fillOpacity: 0.9,
    }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // Rebuild only when the actual location changes, not on every meta update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, listing.latitude, listing.longitude])

  if (listing.latitude == null || listing.longitude == null) return null

  return (
    <a
      href={directionsUrl(listing.latitude, listing.longitude)}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'block', position: 'relative', textDecoration: 'none' }}
      aria-label="Open directions in Google Maps"
    >
      <div
        ref={elRef}
        style={{
          height,
          width: '100%',
          borderRadius: 4,
          overflow: 'hidden',
          pointerEvents: 'none',
          border: '1px solid #ccc',
        }}
      />
      <span
        style={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          background: '#000',
          color: '#FCCC0A',
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 7px',
          borderRadius: 3,
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        Tap for directions ↗
      </span>
    </a>
  )
}

export default MiniMap
