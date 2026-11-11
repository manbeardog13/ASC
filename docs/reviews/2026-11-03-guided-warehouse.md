# ASC guided warehouse review · 3 November 2026

The release target is the ASC tenant under `https://app.nerosummit.com/ASC/`. The existing NERO proxy serves the ASC Pages build. Verification used local copies of that URL structure and isolated staff records. The review did not create admissions or send customer notifications in production.

## Operator journey

**Skladište → Obilazak skladišta → Započni obilazak** opens a first-person view. Choose any of the six rooms, drag to look, and use the arrow controls or keyboard to move. The active room’s real floor geometry, raised deck, shelves and registered rack positions constrain movement. The six room models remain schematic. A bearing points toward a selected rack and does not represent a surveyed route between rooms.

**Vodič** opens six short steps. An operator explores the room, registers and labels a location, plots the rack, admits and labels the set, confirms the set and location together, and retrieves the stored address. Step links open the relevant staff screen. Returning reopens the same step and room. Only a confirmed inventory mapping can highlight a rack for a set.

## Screen audit

| Surface | Verified behavior |
| --- | --- |
| Entry, login, recovery and the two legacy redirects | Route handoff, password recovery, signed-out return, QR-location preservation, usable login after provider rejection. |
| Dashboard, sidebar, profile and settings | Collapsed menu expansion, warehouse guide discovery, phone dismissal, keyboard focus return, signed-in employee identity on shared devices. |
| Admission, set detail and customers | Saved admission handoff, printable set label, current vehicle details, set lookup, location-to-map navigation and unavailable-record feedback. |
| Locations, placement, scanner and checkout | Printed location addresses, paginated label reprints, manual or USB input, rejected rescans clearing the previous target, explicit placement and release confirmation. |
| Locate, warehouse view and spatial studio | Room and rack lookup, empty versus unknown inventory, keyboard rack placement, fallback plan, touch and keyboard walkthrough, loss of rendering context and missing scene download. |
| Reminders, recycling, workshop and team management | Failed reads remain distinguishable from empty lists. Staff must confirm bulk contact recording. Failed writes leave records actionable. Restricted accounts see an explanation. |
| Shared composer and page bottom | No admission ticker, background stock subscription or extra space for the removed strip. Keyboard focus can reach the last page action. |

The earlier route sweep opened 19 URLs signed in and signed out. The combined release added the warehouse guide. Its final sweep covered 17 rendered screens and three redirect URLs at 390 and 1440 CSS pixels. All six guide destinations were checked through sign-in and return. The checks looked for document overflow, unnamed visible controls, failing local requests and uncaught JavaScript exceptions. Additional suites exercised 320-pixel layouts, tablet navigation, zoom, reduced motion, explicitly selected themes, scanner failure, offline states and access revocation.

## Combined design and performance pass

The light default uses a warm pearl background, petrol controls, and a black ASC mark with a red underglow. The staff sidebar groups five primary destinations and puts the role-gated People directory under More. In the dashboard, three working warehouse queries replace timed sales prompts. The global stock strip, its inventory subscription and the separate dashboard tyre-photo carousel are removed. Verified movements remain in the dashboard activity list. The Studio loads 3D assets on demand and keeps the renderer when switching rooms. A focused login field follows the visual viewport in the simulated short-screen keyboard cases.

From the staff menu, More → Warehouse guide opens the six tasks. The guided tour is accessible from the guide header and inside Studio. The host-aware return link goes to Tenants when ASC is mounted under the Nero app.

## Verification boundary

The test suite used synthetic records and a Chromium WebGL renderer. QR label output was rendered and decoded digitally. Physical printer alignment, handset camera scanning in the warehouse, actual shelf load ratings and surveyed aisle dimensions require an on-site check.
