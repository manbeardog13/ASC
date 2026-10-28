import test from 'node:test';
import assert from 'node:assert/strict';
import { activityRow, emitActivity } from '../js/activity-events.js';
test('activity drops personal and unknown payload fields', () => {
  const row = activityRow({kind:'print',entity:'set',entity_id:'ASC-FIXTURE',payload:{outcome:'failed',test:false,name:'private',token:'private',location_id:'slot-1'}},'actor-1');
  assert.deepEqual(row.payload,{location_id:'slot-1',outcome:'failed',test:false});
  assert.equal(row.actor,'actor-1');assert.ok(!('at' in row));
});
test('emitter binds actor to session and confirms returned id', async () => {
  let written;
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'actor-1'}}}})},from:table=>{assert.equal(table,'asc_events');return{insert:row=>{written=row;return{select:()=>({single:async()=>({data:{id:'event-1'}})})}}}}};
  assert.deepEqual(await emitActivity(client,{kind:'checkout',entity:'set',entity_id:'set-1'}),{recorded:true,id:'event-1'});
  assert.equal(written.actor,'actor-1');
});
test('anonymous, failed and unknown writes do not claim recording or retry', async () => {
  let calls=0;
  const client={auth:{getSession:async()=>({data:{session:null}})},from:()=>{calls++;throw Error('unavailable');}};
  assert.equal((await emitActivity(client,{})).recorded,false);assert.equal(calls,0);
  client.auth.getSession=async()=>({data:{session:{user:{id:'actor-1'}}}});
  assert.equal((await emitActivity(client,{kind:'move',entity:'set',entity_id:'set-1'})).recorded,false);assert.equal(calls,1);
});
