import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=process.env.ASC_REPO?new URL('file://'+process.env.ASC_REPO.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
const source=readFileSync(process.env.ASC_COMPOSER_FILE||new URL('app/composer.js',root),'utf8');
const start=source.indexOf('  function tryFlush()'),end=source.indexOf('  function sendRelay(',start);
assert.ok(start>0&&end>start);
async function flush(outcomes){
 const deleted=[],attempted=[],bumped=[],armed=[];let refreshed=0;
 const queue={list:async()=>[{id:'one'},{id:'two'}],remove:async id=>deleted.push(id),bump:async id=>{bumped.push(id);return {attempts:1}}};
 const context={flushing:false,relayReady:true,queueApi:()=>queue,relayUrl:()=>'',postBuilder:async item=>{attempted.push(item.id);return outcomes.shift()},showConnect(){},arm:n=>armed.push(n),refreshQueue:()=>refreshed++};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\ntryFlush();',context);
 for(let i=0;i<20&&context.flushing;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.flushing,false);assert.equal(refreshed,1);return {deleted,attempted,bumped,armed};
}
test('only successful delivery removes a queued message',async()=>{
 assert.deepEqual(await flush(['ok','ok']),{deleted:['one','two'],attempted:['one','two'],bumped:[],armed:[]});
});
test('HTTP and unconfigured failures retain the unsent queue and stop the batch',async()=>{
 for(const result of ['http','unconfigured'])assert.deepEqual(await flush([result,'ok']),{deleted:[],attempted:['one'],bumped:[],armed:[]});
});
test('offline deliveries remain queued with bounded retry backoff',async()=>{
 assert.deepEqual(await flush(['offline','ok']),{deleted:[],attempted:['one'],bumped:['one'],armed:[1]});
});
