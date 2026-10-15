const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=process.env.ASC_REPO||path.resolve(__dirname,'..');
const {createHarness}=require(process.env.ASC_HARNESS_FILE||'./fixtures/composer-harness.cjs');
const user='12345678-1234-1234-1234-123456789abc';
const db=`export const getSession=async()=>({user:{id:'${user}'},access_token:'synthetic-only'});export const loadMyProfile=async()=>({role:'staff'});export const signedPhotoUrls=async()=>({});`;
const config='export const config={SUPABASE_URL:"https://project.example"};';
const supabase=`function chain(table){let op='select',values=null;const filters={};const api=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>{window.__writes=window.__writes||[];if(table==='nero_messages'&&op==='select')return new Promise(r=>window.__historyDone=r).then(resolve,reject);if(op==='insert'){window.__writes.push({table,values});return Promise.resolve({data:table==='nero_chats'?{id:'initial-chat'}:[],error:null}).then(resolve,reject)}return Promise.resolve({data:table==='nero_chats'?[{id:'selected-chat',title:'Saved conversation'}]:[],error:null}).then(resolve,reject)};return (...args)=>{if(key==='insert'||key==='update'){op=key;values=args[0]}if(key==='eq')filters[args[0]]=args[1];return api}}});return api}export const supabase={from:chain,storage:{from:()=>({createSignedUrl:async path=>({data:{signedUrl:'https://project.example/storage/v1/object/sign/nero-attachments/'+path+'?token=synthetic-only'}})})}};`;
const source=process.env.ASC_COMPOSER_FILE?fs.readFileSync(process.env.ASC_COMPOSER_FILE,'utf8'):null;
async function setup(){const h=await createHarness({db,supabase,config,composerSource:source,role:'staff'});await h.page.evaluate(()=>{window.ASCConcierge.answer=()=>Promise.resolve('Odgovor');window.ASCAgent.recall=rows=>window.__recalled=rows});return h}
async function selectHistory(p){await p.locator('.nero-input').focus();await p.locator('[data-act=history]').click();await p.locator('.nero-history button').click();await p.waitForFunction(()=>!!window.__historyDone)}
(async()=>{
 let h=await setup();let p=h.page;
 try{
  await p.locator('.nero-input').fill('First message');await p.locator('.nero-input').press('Enter');await p.waitForFunction(()=>window.__writes?.filter(x=>x.table==='nero_messages').length===2);
  await selectHistory(p);assert.equal(await p.locator('.nero-send').isDisabled(),true);
  await p.locator('.nero-input').fill('For the selected conversation');await p.locator('.nero-input').press('Enter');
  assert.equal(await p.evaluate(()=>window.__writes.filter(x=>x.table==='nero_messages').length),2,'Cannot append while target history is unresolved');
  await p.evaluate(user=>window.__historyDone({data:[{role:'user',body:'Document',attachments:[{path:user+'/tire.pdf',mime:'application/pdf',name:'Saved tire.pdf'}]}],error:null}),user);
  await p.waitForFunction(()=>!document.querySelector('.nero-send').disabled);await p.locator('.nero-saved-files a').waitFor();
  assert.match(await p.locator('.nero-saved-files a').getAttribute('href'),/nero-attachments/);
  assert.equal(await p.evaluate(()=>window.__recalled[0].attachments[0].name),'Saved tire.pdf');
  await p.locator('.nero-input').press('Enter');await p.waitForFunction(()=>window.__writes.filter(x=>x.table==='nero_messages').length===4);
  assert.equal(await p.evaluate(()=>window.__writes.filter(x=>x.table==='nero_messages').at(-2).values.chat_id),'selected-chat');
 }finally{await h.close()}
 h=await setup();p=h.page;
 try{
  await selectHistory(p);await p.locator('[data-act=new]').click();await p.locator('.nero-input').fill('New draft');
  await p.evaluate(()=>window.__historyDone({data:[{role:'user',body:'STALE'}],error:null}));await p.waitForTimeout(30);
  assert.equal(await p.locator('.nero-input').inputValue(),'New draft');assert.equal(await p.locator('.nero-log').innerText(),'');assert.equal(await p.locator('.nero-send').isDisabled(),false);
 }finally{await h.close()}
 h=await setup();p=h.page;
 try{
  await selectHistory(p);await p.locator('.nero-input').fill('Retained draft');await p.evaluate(()=>window.__historyDone({data:null,error:{message:'synthetic error'}}));await p.waitForFunction(()=>!document.querySelector('.nero-send').disabled);
  assert.equal(await p.locator('.nero-input').inputValue(),'Retained draft');assert.match(await p.locator('.nero-log').innerText(),/nije učitan/);
 }finally{await h.close()}
 console.log('PASS history isolates sends, restores clickable attachment refs, suppresses old loads, and recovers after errors');
})().catch(e=>{console.error(e);process.exitCode=1});
