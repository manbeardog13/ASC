# ASC · Prostorni studio

The browser entry is `app/spatial-studio/index.html`. Serve it within the ASC app tree so that existing staff sessions, database adapters, record links, QR scanner and composer keep the correct origin and relative URLs. No new API key is required. The six room schematics are public architecture; inventory requires an ASC staff session and uses the existing database policies.

## Build and verify

Run `npm ci`, `npm test`, and `npm run build` in this folder (Node 24). The build first type-checks the complete TypeScript application, then emits a small UI chunk and a lazy WebGL chunk. Deploy `index.html`, `sync.js` and `assets/` alongside the existing ASC runtime. Do not deploy dependency caches.

## Operator flows

- Use the space picker to change room. Switch between 3D and the floor plan, or collapse the inventory panel for a larger drawing.
- Search the visible list by rack, plate, owner, size or set code. Command/Ctrl+K searches across available records and room names. A selected rack focuses the camera and opens its set list.
- A USB scanner completes its input with Enter. Both current and historic ASC codes are recognized. Camera scanning uses the existing ASC scanner. No scanned URL is followed directly.
- Occupancy uses actual mapped quantities and rack capacity. Unknown quantities remain unknown. The “Bez stupca” tab exposes unplaced sets from any area.
- Register actual location labels first, then use “Dodaj stupac” and click supported floor. Existing rack labels and non-overlapping rack footprints are enforced. No slot coordinates are invented for unassigned inventory.
- The sync badge exposes pending operations and conflicts. Only rack placement metadata enters the per-operator IndexedDB outbox; customer and set records do not. Database row uniqueness/base timestamps are authoritative. Retries re-check the active session; concurrent writes are not automatically merged into physical locations.
- The floor model remains schematic until actual surveys and bindings are available. A measured operator area does not certify the associated architecture or establish millimetre accuracy. SKU data is optional; the application does not substitute codes for missing catalog identifiers.

Reduced motion, keyboard search, a narrow-screen layout, a collapsible side panel and an SVG fallback keep the studio usable without WebGL. The Node tests use synthetic fixtures; they do not write to production.
