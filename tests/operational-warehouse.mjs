import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarize} from '../app/stock-strip-view.js';
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
test('recent strip includes only active records with real public codes and the configured quantity',()=>{
 const record={public_code:'ASC-2030-0052',status:'in_storage',quantity:3,rack:'R3',zone:'REGALI',vehicle:{plate:'DU 123'},tires:[{size:'205/55 R16'},{size:'205/55 R16'}]};
 const rows=summarize([record,{...record,deleted_at:'2030-05-01'},{...record,status:'checked_out'},{...record,picked_up_at:'2030-05-01'},{...record,public_code:''}]);
 assert.equal(rows.length,1);assert.equal(rows[0].firstTireId,record.public_code);assert.equal(rows[0].count,3);
 assert.deepEqual(rows[0].locations,['REGALI · R3']);assert.equal(rows[0].size,'205/55 R16');
});
