import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOperation, applyOperation, cleanLayout } from '../app/spatial-studio/sync.js';

const area_id='9e21fdb9-58a4-4e14-823e-ed1ad4685b94';
const id='b2ec9b08-725f-4e6a-a42e-91cf5dbd6faf';
const input={area_id,rack:' b  4 ',x:1,z:-2,capacity:8};
const createdAt='2026-11-01T12:45:00Z', next='2026-11-01T12:45:01Z';
const op=makeOperation(input,id);
test('lost confirmation and queue replay converge without duplicate rack insertion',async()=>{
  let row=null,writes=0;const transport={read:async()=>row,write:async p=>{writes++;row={...p,updated_at:next};throw Error('Response lost');}};
  await assert.rejects(applyOperation(op,transport),/Response lost/);
  assert.deepEqual(await applyOperation(op,transport),{kind:'done'});assert.equal(writes,1);
});
test('different operators cannot replace the same rack on concurrent create',async()=>{
  const other={...op.payload,id:crypto.randomUUID()};let read=0;
  const result=await applyOperation(op,{read:async()=>++read===1?null:other,write:async()=>{throw Object.assign(Error('duplicate'),{code:'23505'});}});
  assert.equal(result.kind,'conflict');
});
test('an edit based on stale geometry cannot clobber another position',async()=>{
  const update=makeOperation({...input,base:{id,updated_at:createdAt}},crypto.randomUUID());let writes=0;
  const result=await applyOperation(update,{read:async()=>({...op.payload,x:9,updated_at:next}),write:async()=>writes++});
  assert.equal(result.kind,'conflict');assert.equal(writes,0);
});
test('conditional patch racing another update leaves the loser available for reconciliation',async()=>{
  const update=makeOperation({...input,base:{id,updated_at:createdAt}});let read=0;
  const result=await applyOperation(update,{read:async()=>({...op.payload,x:9,updated_at:++read===1?createdAt:next}),write:async(p,base)=>{assert.equal(p.id,id);assert.equal(base.updated_at,createdAt);return null;}});
  assert.equal(result.kind,'conflict');
});
test('retryable transport failures stay pending; rejected physical placement stays a conflict',async()=>{
  for(const status of [401,403,429,503]){
    await assert.rejects(applyOperation(op,{read:async()=>null,write:async()=>{throw Object.assign(Error('unavailable'),{status});}}),/unavailable/);
  }
  const conflict=await applyOperation(op,{read:async()=>null,write:async()=>{throw Object.assign(Error('constraint'),{code:'23514',status:400});}});
  assert.equal(conflict.kind,'conflict');
});
test('layout and queued payloads exclude all inventory, credentials and unrecognized fields',()=>{
  const cache=cleanLayout({areas:[{id:area_id,name:'A',customer:'PRIVATE'}],positions:[{...op.payload,tires:['PRIVATE']}],bindings:[{warehouse:'main',access_token:'PRIVATE'}],sets:['PRIVATE']});
  assert.doesNotMatch(JSON.stringify(cache),/PRIVATE|access_token|customer|tires/);
  assert.doesNotMatch(JSON.stringify(makeOperation({...input,plate:'PRIVATE',session:'PRIVATE'})),/PRIVATE/);
  assert.equal(op.payload.rack,'B 4');
  for(const bad of [{area_id:'invalid'},{x:Infinity},{rack:'=bad'},{capacity:0},{base:{id,updated_at:'x'}}])assert.throws(()=>makeOperation({...input,...bad}));
});
