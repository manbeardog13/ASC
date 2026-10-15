# Connected ground floor

The reference ground floor is attached to the unchanged 2.1/2.2/2.3 warehouse scene. `ground` opens only the ground floor; `all` includes the original warehouse levels. Newly proposed attic/office geometry is withheld until its layout is established.

The street remains at the left, gates 3, 2 and 1 run top to bottom, cars point toward reception and 2.1 respectively, and the lunch table reaches its south wall. These are schematic units, not a measurement survey.

`building.js` owns only architecture and service fixtures. `actors.js` owns separate cars and a people container. Car instances have independent root transforms, stable IDs and four named wheel pivots. `setActorPose`, `getActorObject`, `registerActor`, `rollActorWheels` and `resetActors` support future animation. Navigation does not reset their positions. No movement scheduler or people are added yet. GLB export preserves the actor hierarchy.

The private spatial app received the equivalent modules. `tests/building-layout.mjs` checks the layout contract; `tests/building.browser.cjs` checks room rendering, responsive controls and GLB export with synthetic data.
