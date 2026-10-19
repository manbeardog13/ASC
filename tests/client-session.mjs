import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const read = file => readFile(path.join(process.cwd(), file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function gate({ pathname = '/ASC/app/dashboard.html', session = {user:{id:'user-A'}}, fail = false, pendingSession = null, pendingPaint = null, pendingSignOut = null } = {}) {
  const source = await read('app/app.js');
  const code = source.slice(source.indexOf('(() => {'), source.indexOf('\nconst root = document.documentElement;'));
  const handlers = new Map(), auth = [], targets = [], events = [];
  let reads = 0, signouts = 0, reloads = 0, reveals = 0;
  const style = {};
  const db = { getSession: async () => { reads++; if (fail) throw Error('offline'); return pendingSession ? pendingSession.promise : session; },
    signOut: async () => { signouts++; if (pendingSignOut) await pendingSignOut.promise; }, onAuthChange: fn => auth.push(fn) };
  const sandbox = { document:{documentElement:{style},addEventListener:(type,fn)=>handlers.set(type,fn),dispatchEvent:event=>events.push(event.type)},
    window:{ascLiveFirst:pendingPaint?.promise,ASCSplash:{done(){reveals++;},bloom:cb=>cb?.(),handoff:url=>targets.push(url)}},
    sessionStorage:{setItem(){}}, location:{pathname,reload:()=>reloads++},
    db,Promise,CustomEvent:class{constructor(type){this.type=type;}},setTimeout:()=>0 };
  vm.runInNewContext(code.replace("import('../js/db.js')", 'Promise.resolve(db)'),sandbox);
  await tick(); await tick();
  return { style, auth, targets, events, reads:()=>reads, signouts:()=>signouts, reloads:()=>reloads, reveals:()=>reveals,
    clickLogout:()=>handlers.get('click')?.({target:{closest:()=>true},preventDefault(){},stopPropagation(){}}) };
}

test('dashboard authenticates and logout reaches the real auth service', async () => {
  const app = await gate();
  assert.equal(app.reads(),1);
  app.clickLogout(); await tick();
  assert.equal(app.signouts(),1);
  assert.deepEqual(app.targets,['login.html']);
  assert.ok(app.events.includes('asc:sign-out'));
});
test('failed or absent dashboard session cannot reveal the protected screen', async () => {
  for (const opts of [{fail:true},{session:null}]) {
    const app = await gate(opts);
    assert.equal(app.style.visibility,'hidden');
    assert.deepEqual(app.targets,['login.html']);
  }
});
test('signout in another tab clears the view; switching accounts reloads private DOM', async () => {
  const app=await gate();
  app.auth[0]('SIGNED_IN',{user:{id:'user-B'}});
  assert.equal(app.reloads(),1);
  assert.equal(app.style.visibility,'hidden');
  app.auth[0]('SIGNED_OUT',null);
  assert.deepEqual(app.targets,['login.html']);
});

test('a session resolved after signout cannot reveal the old account',async()=>{
  const pendingSession=deferred();const app=await gate({pendingSession});
  app.auth[0]('SIGNED_OUT',null);
  pendingSession.resolve({user:{id:'user-A'}});await tick();await tick();
  assert.equal(app.style.visibility,'hidden');assert.equal(app.reveals(),0);assert.deepEqual(app.targets,['login.html']);
});
test('account switch while the initial session is pending reloads instead of revealing old DOM',async()=>{
  const pendingSession=deferred();const app=await gate({pendingSession});
  app.auth[0]('SIGNED_IN',{user:{id:'user-B'}});
  pendingSession.resolve({user:{id:'user-A'}});await tick();await tick();
  assert.equal(app.style.visibility,'hidden');assert.equal(app.reveals(),0);assert.equal(app.reloads(),1);
});
test('late first-paint completion cannot cancel the signout cover',async()=>{
  const pendingPaint=deferred();const app=await gate({pendingPaint});
  app.auth[0]('SIGNED_OUT',null);
  pendingPaint.resolve();await tick();await tick();
  assert.equal(app.style.visibility,'hidden');assert.equal(app.reveals(),0);
});

test('logout click suppresses late session reveal while signOut is still pending',async()=>{
  const pendingSession=deferred(),pendingSignOut=deferred();
  const app=await gate({pendingSession,pendingSignOut});
  app.clickLogout();await tick();
  pendingSession.resolve({user:{id:'user-A'}});await tick();await tick();
  assert.equal(app.style.visibility,'hidden');assert.equal(app.reveals(),0);assert.equal(app.signouts(),1);
  pendingSignOut.resolve();await tick();assert.deepEqual(app.targets,['login.html']);
});

async function queue(initial = []) {
  let user='user-A', blocked=false;
  const data=new Map([['asc.outbox',JSON.stringify(initial)]]);
  const context=vm.createContext({localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(blocked)throw Error('quota');data.set(key,value);}},
    Date,Math,console:{warn(){}},navigator:{onLine:false},window:{addEventListener(){}}});
  const store=new vm.SyntheticModule(['getState','setState','emit','refreshActiveView'],function(){
    this.setExport('getState',()=>({online:false}));this.setExport('setState',()=>{});this.setExport('emit',()=>{});this.setExport('refreshActiveView',()=>{});
  },{context});
  const mod=new vm.SourceTextModule(await read('js/offline.js'),{context});await mod.link(()=>store);await mod.evaluate();
  mod.namespace.initOffline(async()=>{},async()=>user);
  return {q:mod.namespace, entries:()=>JSON.parse(data.get('asc.outbox')), user:id=>user=id, block:()=>blocked=true};
}
test('outbox replays only its owner and preserves legacy unowned entries', async()=>{
  const legacy={kind:'updateSet',setId:'legacy',patch:{paid:true}};
  const env=await queue([legacy]);const calls=[];
  env.q.enqueue({kind:'updateSet',setId:'A',patch:{paid:true}},'user-A');
  env.q.enqueue({kind:'updateSet',setId:'B',patch:{paid:false}},'user-B');
  env.user('user-B');await env.q.replay(async item=>calls.push(item.setId));
  assert.deepEqual(calls,['B']);
  assert.deepEqual(env.entries().map(x=>x.setId),['legacy','A']);
  env.user('user-A');await env.q.replay(async item=>calls.push(item.setId));
  assert.deepEqual(calls,['B','A']);assert.deepEqual(env.entries(),[legacy]);
});
test('enqueue during a pending write is processed and never lost', async()=>{
  const env=await queue();const calls=[];
  env.q.enqueue({kind:'updateSet',setId:'first'},'user-A');
  await env.q.replay(async item=>{calls.push(item.setId);if(item.setId==='first'){await tick();env.q.enqueue({kind:'updateSet',setId:'second'},'user-A');}});
  assert.deepEqual(calls,['first','second']);assert.deepEqual(env.entries(),[]);
});
test('account switch while replay awaits never drains the next account-owned entry',async()=>{
  const env=await queue();const calls=[];
  env.q.enqueue({kind:'updateSet',setId:'first'},'user-A');env.q.enqueue({kind:'updateSet',setId:'second'},'user-A');
  await env.q.replay(async item=>{calls.push(item.setId);env.user('user-B');});
  assert.deepEqual(calls,['first']);assert.deepEqual(env.entries().map(x=>x.setId),['second']);
});
test('storage failure and missing owner fail queueing visibly',async()=>{
  const env=await queue();assert.throws(()=>env.q.enqueue({kind:'updateSet',setId:'none'}));
  env.block();assert.throws(()=>env.q.enqueue({kind:'updateSet',setId:'A'},'user-A'),/quota/);
});
test('queued database executor independently rejects unowned and other-account writes',async()=>{
  const src=(await read('js/db.js')).match(/export async function executeQueuedMutation\(mutation\) \{[\s\S]*?\n\}/)[0].replace('export ','');
  const writes=[];const context=vm.createContext({getSession:async()=>({user:{id:'user-A'}}),applySetPatch:async(id,patch)=>writes.push({id,patch}),console});vm.runInContext(src,context);
  for(const ownerId of [undefined,'user-B'])await assert.rejects(context.executeQueuedMutation({kind:'updateSet',setId:'wrong',ownerId,patch:{paid:true}}));
  assert.equal(writes.length,0);
  await context.executeQueuedMutation({kind:'updateSet',setId:'right',ownerId:'user-A',patch:{paid:true}});
  assert.equal(writes.length,1);
});
