import {geometry} from './canvas-geometry.ts';

// Public architectural catalogue, no operational area or inventory IDs inferred.
// Read schematic extents from the same manifest as the rendered floor geometry.
const catalogue=[
 {id:'house-ground',zone:'2.1',name:'Prizemlje',site:'Kuća'},
 {id:'house-platform',zone:'2.2',name:'Drvena platforma',site:'Kuća'},
 {id:'house-attic',zone:'2.3',name:'Potkrovlje kuće',site:'Kuća'},
 {id:'attic-parts',zone:'POLICE',name:'Bijele police',site:'Potkrovlje'},
 {id:'attic-racks',zone:'REGALI',name:'Regali i platforma',site:'Potkrovlje'},
 {id:'triangular-store',zone:'TROKUT',name:'Trokutasto spremište',site:'Spremište'},
] as const;
export const rooms=catalogue.map(room=>{
 const space=geometry.getSpace(room.id);
 if(!space)throw new Error(`Missing architectural space: ${room.id}`);
 return {...room,width:space.width,depth:space.depth};
});
