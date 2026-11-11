import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILDING_SPACES} from '../app/warehouse-preview/inventory-ui.js';
import {getSpace,mapAreaPoint} from '../app/warehouse-preview/building.js';
test('six provisioned rooms use their reviewed schematic geometry and exclude the office and floor voids',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261028075123_operational_storage_areas.sql',import.meta.url),'utf8');
 const rooms=[...sql.matchAll(/\('main','([^']+)','[^']+',(\d+),(\d+),'grid'\)/g)];
 const pairs=new Map([...sql.matchAll(/\('([^']+)','([a-z-]+)'\)/g)].map(m=>[m[1],m[2]]));
 assert.equal(rooms.length,6);assert.equal(new Set(rooms.map(m=>pairs.get(m[1]))).size,6);
 for(const [,zone,w,d] of rooms){const id=pairs.get(zone),room=getSpace(id);assert.ok(BUILDING_SPACES.some(s=>s.id===id));assert.equal(room.inventory,true);assert.deepEqual([+w,+d],[room.width,room.depth]);}
 assert.equal(mapAreaPoint('attic-parts',getSpace('attic-parts'),2,-9,.27),null);
 assert.equal(mapAreaPoint('triangular-store',getSpace('triangular-store'),-2,-3,.27),null);
});
test('the staff composer does not load a moving inventory strip', () => {
 const source = readFileSync(new URL('../app/composer.js', import.meta.url), 'utf8');
 assert.doesNotMatch(source, /stock-strip|createTyreStream/);
});
