# Dispatch Pro — Tire Pressure Monitor (TPMS)

A single-page prototype of the Dispatch Pro tire pressure monitor for trucks and trailers, built on the Dispatch Pro design system (shadcn/ui at 80%).

**Live page:** https://rojithk3-droid.github.io/dispatch-pro-tire-pressure-monitor/

## What it does
- **Fleet list** — KPI filters, sortable asset table with a dot per tire, donut, "needs attention" list.
- **Asset detail** — interactive 3D tractor and 53' dry van (Three.js), hover cards, gauge-ring PSI bubbles, linked tire list, area chart with drag-to-pan, route map.
- **Settings** — alert thresholds with live zone preview, notification recipients, success flow.
- Light and dark theme.

Flow: `Equipment ▸ Diagnostics ▸ TMPS`, or open `#tmps` directly (`#tmps/DTL88`, `#tmps/V305`, `#tmps/DTL88/settings`).

## Files
- `index.html` — the whole app (open it in a browser; needs internet for fonts, Three.js, Leaflet and map tiles).
- `truetrack-v1.html` — the earlier TrueTrack-styled version, kept for reference.
- `src/` — the source parts `index.html` was assembled from (CSS, markup, JS).

Prototype data is simulated; no real telematics are connected.
