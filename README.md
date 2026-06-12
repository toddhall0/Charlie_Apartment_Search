# Charles · NYC Apartment Showing Tracker

A mobile-first web app for organizing NYC rental showings for Charles, who
commutes to Pace University (1 Pace Plaza, Lower Manhattan). Styled after NYC
subway / MTA station signage.

## Stack

- **Vite + React** (JavaScript)
- **Leaflet** for maps (OpenStreetMap tiles) — no react-leaflet, no router, no UI framework
- **localStorage** for persistence
  - `apt-meta-v1` — per-listing status / notes / showing date+time, keyed by listing id
  - `apt-custom-v1` — user-added listings
- **Nominatim** for geocoding user-added units

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
npm run preview  # preview the build
```

## Features

- **Listings tab** — status-colored cards with photo (station-sign fallback),
  rent strip (base / net effective / available), market-status pill, subway
  access + commute to Pace, mini map, amenities, agent, status select,
  showing date/time, and auto-saving notes. Filter by borough / status /
  hide off-market, and sort by neighborhood / net rent / status.
- **Add a unit** — paste a StreetEasy building URL to auto-fill address, unit,
  and borough; fill the rest manually (the StreetEasy page can't be scraped due
  to CORS / bot protection). Geocodes via Nominatim, falling back to a
  borough-center pin.
- **Map tab** — interactive Leaflet map with status-colored markers that
  recolor live, popups, and a legend.
- **Schedule tab** — chronological list of all showings, plus a nearest-neighbor
  route planner per day with transit-directions links.
- **Backup** — Export / Import JSON in the footer (localStorage is per-device).

## Notes

Data lives only in the browser's localStorage on the device you use. Use
**Export JSON** to back up and **Import JSON** to restore or move between devices.
