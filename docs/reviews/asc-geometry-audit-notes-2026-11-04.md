# ASC geometry evidence notes — 4 November 2026

Read-only architectural audit of PR #49 at `81ee98c6c59ef0891005b7a31bf941cbf9f00e5e`. These notes describe code and owner-recorded topology, not a site survey. Every numeric coordinate below is an **unmeasured drawing unit**, not metres. The approximately six-metre entrance route is an owner estimate, not a scale calibration.

## Sources and actual geometry ownership

- [Authoritative owner constraints](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/docs/reviews/asc-spatial-constraints-2026-10-21.md#L3-L21), including [preserved rack corrections](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/docs/reviews/asc-spatial-constraints-2026-10-21.md#L32-L70).
- [Studio catalogue](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/spatial-studio/src/rooms.ts) contains six selectable inventory-capable spaces and display dimensions. It does not define a second six-room building assembly.
- [Studio geometry adapter](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/spatial-studio/src/canvas-geometry.ts#L1-L4) imports the existing `warehouse-preview/building.js`. [Studio 3D](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/spatial-studio/src/Scene3D.tsx#L183-L199) selects individual rooms through that shared model.
- [Canonical spaces and transform](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L5-L56); [original corrected geometry fingerprint](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/tests/fixtures/upper-geometry-reference.json), source `190d1edcd64f45a3994e651cf8b8a19ec573fd77`.

There are ten architectural groups: the six catalogue spaces plus office, workshop, table-room and reception. The office is deliberately `inventory:false`; its absence from the six-space list does not mean it is absent from the architectural model. `model.js` maintains operational areas separately. The review must not turn these contextual groups into operational storage areas or derive bindings from their names.

## Exact placed geometry

Axes are east `+x`, south `+z`, up `+y`. The upper assembly uses one translation `[-5,+1,0]`, zero rotation and unit scale. The house uses a quarter-turn around Y, with its final centre at `[7,y,-5]`.

| Space | Occupied floor in placed x/z coordinates | Base y |
| --- | --- | --- |
| White-shelf attic A | `[-17,-5] × [0,18]` plus `[-17,-13] × [-14,0]` | 4.2 |
| Rack attic B | `[-5,5] × [-14,18]` | 4.2 |
| Office | `[-13,-5] × [-14,0]` | 4.2 |
| House ground | `[0,14] × [-10,0]` | 0 |
| House intermediate platform | `[7.22,12.64] × [-7.5,-2.5]` | 1.6 |
| House attic | `[0,7.3] × [-10,0]` plus `[7.3,14] × [-8,-3.65]` | 3.2 |
| Triangular store | vertices `[-22,-10],[-17,-17],[-17,-10]` | 0 |

These are floor regions, not surveyed inside-wall clearances. Wall thickness, roof slope and fixture envelopes further limit usable space.

## Confirmed relationships preserved by the model

“Confirmed” here means established by the owner constraints and represented in the reviewed code; it does not certify physical dimensions.

| Relationship | Current shared plane/span |
| --- | --- |
| A east ↔ B west | `x=-5`, `z=0…18` |
| Office east ↔ B west | `x=-5`, `z=-14…0` |
| Office west ↔ inner east of A | `x=-13`, `z=-14…0` |
| Office south ↔ inner north of A | `z=0`, `x=-13…-5` |
| Both attic front/rear edges | `z=-14` and `z=18` |
| A western outside wall above gate façade | `x=-17`; gates 3, 2, 1 at `z=-5.2,6.2,14.8` |

The upper assembly must remain rigid. Shortening B to start at the office south wall would reintroduce the explicitly rejected reconstruction error.

## Conflicting house contacts and levels

1. **Yellow contact:** the verbal constraint says the office east wall touches the existing house. The preserved upper image/model instead places B immediately east of that same office wall for its complete `z=-14…0` span. Office east is `x=-5`; fixed-house west is `x=0`, leaving a five-unit plane separation. Their z spans overlap only over `-10…0`. A same-level third room immediately east of that office wall would occupy B's interior. Translating the office independently would destroy the L and the common assembly.
2. **Blue contact:** B north is `z=-14`, `x=-5…5`; the fixed-house rectangular envelope is `x=0…14,z=-10…0`. The nearest parallel house boundary is its north plane `z=-10`, four units away. Neither fixed-house z boundary coincides with B north. The evidence says “house side wall” but does not identify a measured, placed house face; do not silently label a specific house face as the intended mate.
3. **Plan overlap:** B and the occupied rear portion of the house attic overlap over `x=0…5,z=-10…0`: 50 schematic square units. This is not a claim that two floor slabs at different heights collide. It proves the assumed placement is not a clean lateral join and demands a section, not merely another plan translation.
4. **Elevation discrepancy:** the upper assembly's actual base is `3.2+1=4.2`, while the house attic is `3.2`. The one-unit offset and the 1.2-unit rack platform rise are not surveyed. A door between these floors would require a measured transition; the current model does not prove one.
5. **Concrete model collision if forcibly overlaid:** the house's west roof patch at placed `x=0…1.25` has `y=3.32-1.48z` (derived from `houseRoof` at building.js lines 192–193). B's base slab occupies `y=4.01…4.2`, and that roof crosses it at approximately `z=-0.595…-0.466`, inside B. This is an intersection of the assumed model surfaces, not evidence of real construction. The central deck framework would also intersect portions of this roof if both assemblies were shown together.

The existing safeguard is correct: `BUILDING_TOPOLOGY.integrationReady` is false; `setView('all')` hides the upper assembly, while upper review hides the house. See [view isolation](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L306-L312). Six independent navigable destinations do not resolve the joint or constitute a continuous building walkthrough.

## Connections are not yet established doorways

- The four `joins` are wall adjacencies, not traversable opening definitions. The shared A/B and office boundaries are continuous wall meshes ([lines 206 and 240](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L206)). Do not infer a doorway or passage from a join record.
- A has an actual north corridor opening at placed `x=-15.8…-14.2,z=-14`, with an open wooden leaf. Its width and height remain unmeasured ([lines 198–205](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L198-L205)). What lies beyond it is not established by this opening alone.
- The office's visible wooden “door” at local x=-6.55 (placed x=-11.55), z=-13.86 is drawn in front of a continuous office north wall at z=-14. No wall opening is cut there. Treat it as an unverified visual door marker; do not certify access or cut a hole without confirming the actual entrance ([lines 240–241](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L240-L241)).
- The workshop stair is a separate existing flight ending at y=4.2 near x=-15.59,z=1.5. Its endpoint lies within A's broad floor arm, which currently has no corresponding stairwell/landing cutout. This requires a measured landing/void and headroom section, not a guessed hole. It is distinct from the single recovered house stair ([lines 283–286](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L283-L286)).
- The one house stair spans y=0…3.2. After the quarter-turn its nominal centreline is z=-9.2, with x approximately 7.3…10.7. It terminates at the house attic edge. The intermediate platform lies at z=-7.5…-2.5, so this geometry does not establish a direct landing from that stair to the intermediate platform. Preserve the one stair; measure actual landings before inventing extra flights ([lines 188–191 and 295–296](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L188-L191)).
- The ground route is represented separately: gate 3 → first workshop space → table-room door at `[-14.8,-10]` → triangular-store doorway at `[-17,-11.85]`. The drawing distance to the second-room door is 4.8 units; the separately recorded approximately 6 m owner estimate must not be used to rescale the entire plan. The triangle shares the table-room's west wall and has a real modeled opening ([lines 253–279](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L253-L279)).

## Rack correction, short stair and lift

The central deck's placed footprint is `x=-2.8…4.1`, `z=-7.244444…4.133333`; top y=5.4, base room y=4.2. Its rendered deck, picking plane and placement height derive from one footprint. The six rear rack units stay on y=4.2, behind the deck's north edge. Four side rack units stay on the deck; front units remain on the lower floor. The west lower strip between wall plane x=-5 and deck edge x=-2.8 is 2.2 drawing units **before** allowing wall thickness and margins. Existing tests check schematic tire-set and pedestrian envelopes; they do not certify aisle width.

The six short steps and rails remain at the deck's south edge, ending on the lower floor. The goods lift remains near the front-west corner, nominal placed centre `[-4.3, y, 15.511111]`; the schematic platform base spans y=4.2…4.44. It is a visual fixture, not a working inter-level lift model: its lower landing, shaft/pit, door access, served elevations, rated load and usable clear envelope are not specified. Do not create a new shaft or alter its position to fix the house joint. See [rack assembly construction](https://github.com/manbeardog13/ASC/blob/81ee98c6c59ef0891005b7a31bf941cbf9f00e5e/app/warehouse-preview/building.js#L219-L238).

## Evidence needed and unresolved alternatives

Recommended interim state: preserve all owner-corrected internal geometry, retain view isolation, and publish a source-bound plan/section with the two disputed contacts and measurements explicitly pending.

| Question | Alternatives to leave unresolved | Needed evidence |
| --- | --- | --- |
| What touches office east? | B at the same level as the preserved image; a different-height house segment; or a different meaning of the earlier “house wall” description | Owner-marked plan/photo showing the wall and what is immediately across it; level on each side |
| Which house face meets B north? | A surveyed return/recess of the house; a differently identified house face; or an erroneous reference relationship | One plan tying house corners to façade and the shared attic rear edge |
| Is the one-unit level difference real? | Actual split levels with a transition; inconsistent drawing datum; vertically stacked contact | Common-datum floor elevations, slab thicknesses, door thresholds and headroom section |
| How is the upper floor entered? | Workshop-stair landing/void and corridor door; office access elsewhere | Stair rise/run/width, landing corners, floor void, actual doorway locations and clear widths |
| Can the current rack passage be approved? | Same topology with measured proportions; local owner-approved fixture clearance change | Narrowest clear aisle, actual full-set envelope, platform edges/height and rack footprints/load ratings |
| How does the lift connect levels? | Existing lift landing/shaft in its preserved location; source fixture only until measured | Lift shaft and landing plan, served levels and access envelope |

If the survey disproves the preserved common-edge assembly itself, obtain an explicit owner choice identifying the specific changed relationship before revising it. Do not preselect a remodeled upper floor as the solution.

## Safe implementation scope

Safe changes include source-derived catalogue dimensions, explicit unmeasured/junction status, a separate geometry diagnostic/proposal, and regression checks proving the preserved assembly and unresolved contacts remain visible as such. A wall opening, room shift, floor-level change, inventory remap, operational binding, access permission or production database mutation is not justified by the available evidence. The geometry fingerprint should stay unchanged unless a specific owner-approved geometric correction is established.
