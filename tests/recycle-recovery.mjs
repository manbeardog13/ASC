import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=process.env.ASC_TEST_ROOT || fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function database(result={data:[{id:'set-1'}],error:null}) {
 const calls=[];const chain={};
 for(const method of ['update','eq','not','select']) chain[method]=(...args)=>{calls.push([method,...args]);return chain;};
 chain.then=(a,b)=>Promise.resolve(result).then(a,b);
 const context=vm.createContext({supabase:{from:table=>{calls.push(['from',table]);return chain;}},fail:(e)=>new Error(e.message),applySetPatch:async(...args)=>calls.push(['applySetPatch',...args])});
 for(const name of ['restoreSet','restoreSetUnplaced']) {const source=read('js/db.js').match(new RegExp('export async function '+name+'\\([^]*?\\n\\}'))?.[0];assert(source,name+' missing');vm.runInContext(source.replace('export ',''),context);}
 return {calls,db:context};
}
test('ordinary restore preserves its existing location',async()=>{
 const {db,calls}=database();await db.restoreSet('set-1');assert.equal(JSON.stringify(calls),JSON.stringify([['applySetPatch','set-1',{deleted_at:null}]]));
});
test('explicit unplaced restore clears location and restores in one guarded update',async()=>{
 const {db,calls}=database();await db.restoreSetUnplaced('set-1');
 assert.equal(calls.filter(x=>x[0]==='update').length,1);
 assert.equal(JSON.stringify(calls.find(x=>x[0]==='update')[1]),JSON.stringify({deleted_at:null,location_id:null,zone:null,rack:null,shelf:null,slot:null}));
 assert.deepEqual(calls.find(x=>x[0]==='not'),['not','deleted_at','is',null]);
 assert.deepEqual(calls.find(x=>x[0]==='eq'),['eq','id','set-1']);
});
test('unplaced restore rejects denied/stale rows and database failures',async()=>{
 for(const result of [{data:[],error:null},{data:null,error:{message:'network disconnected'}}]) await assert.rejects(database(result).db.restoreSetUnplaced('set-1'));
});
function ui() {
 let listener,confirmed=false,restoreError=null,recoveryError=null,pending=null;
 const state={restore:0,recovery:0,removed:false,toasts:[]};
 const body={children:[],append(node){this.children.push(node);}};
 const row={dataset:{id:'set-1',code:'ASC-SYNTH'},querySelector:s=>s==='.rec-body'?body:body.children.find(x=>x.className==='rec-recovery')};
 const makeButton=()=>({disabled:false,closest:()=>row});const restoreButton=makeButton(),recoverButton=makeButton();
 const source=read('app/live-recycle.js');
 const offer=source.match(/function offerUnplacedRestore\(row\) \{[^]*?\n\}/)?.[0];assert(offer,'recovery UI missing');
 const handler=source.slice(source.indexOf("list?.addEventListener('click'"),source.indexOf('// The gate in app.js'));
 const context=vm.createContext({list:{addEventListener:(_,fn)=>listener=fn},window:{confirm:()=>confirmed},location:{href:''},
  document:{createElement:()=>({dataset:{},children:[],append(...nodes){this.children.push(...nodes);}})},
  restoreSet:async()=>{state.restore++;if(restoreError)throw restoreError;},restoreSetUnplaced:async()=>{state.recovery++;if(pending)await pending;if(recoveryError)throw recoveryError;},
  purgeSetPermanently:async()=>{},removeRow:()=>state.removed=true,showToast:x=>state.toasts.push(x),console:{warn(){}},setTimeout:()=>0});
 vm.runInContext(offer+'\n'+handler,context);
 const click=type=>listener({target:{closest:selector=>selector===(type==='restore'?'[data-restore]':'[data-restore-unplaced]')?(type==='restore'?restoreButton:recoverButton):null}});
 return {state,row,body,context,click,confirm:value=>confirmed=value,restoreFails:error=>restoreError=error,recoveryFails:error=>recoveryError=error,pending:p=>pending=p,recoverButton};
}
test('slot-conflict restore offers recovery without automatically clearing location',async()=>{
 for(const message of ['That slot is blocked.','That slot already holds ASC-OTHER.','That already exists.']) {
  const app=ui();app.restoreFails(new Error(message));await app.click('restore');
  assert.equal(app.state.restore,1);assert.equal(app.state.recovery,0);assert.equal(app.body.children.length,1);assert.equal(app.state.removed,false);
  await app.click('restore');assert.equal(app.body.children.length,1,'do not duplicate recovery control');
 }
 const ordinary=ui();await ordinary.click('restore');assert.equal(ordinary.state.removed,true);assert.equal(ordinary.state.recovery,0);
 const offline=ui();offline.restoreFails(new Error('Network disconnected'));await offline.click('restore');assert.equal(offline.body.children.length,0);
});
test('recovery needs explicit confirmation and navigates to placement only after save',async()=>{
 const app=ui();await app.click('unplaced');assert.equal(app.state.recovery,0);assert.equal(app.context.location.href,'');
 let release;app.pending(new Promise(resolve=>release=resolve));app.confirm(true);
 const active=app.click('unplaced');await app.click('unplaced');assert.equal(app.state.recovery,1);assert.equal(app.context.location.href,'');
 release();await active;assert.equal(app.context.location.href,'place.html?set=ASC-SYNTH');
});
test('failed explicit recovery leaves the row visible and retryable',async()=>{
 const app=ui();app.confirm(true);app.recoveryFails(new Error('no access'));await app.click('unplaced');
 assert.equal(app.context.location.href,'');assert.equal(app.state.removed,false);assert.equal(app.row.dataset.busy,undefined);assert.equal(app.recoverButton.disabled,false);assert.deepEqual(app.state.toasts,['no access']);
});
