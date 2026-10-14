import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/agent.js',import.meta.url),'utf8');
async function fixture(flag){
  let calls=0;
  const context=vm.createContext({ASC_AGENT_REMOTE_ALLOWED:flag});
  const module=new vm.SourceTextModule(source,{context});
  await module.link(async name=>{
    const exports=name.endsWith('supabaseClient.js')?{supabase:{functions:{invoke:async()=>{calls++;return {data:{content:[{type:'text',text:'synthetic'}]}};}}}}
      :name.endsWith('domain.js')?{matchesQuery(){},isDueSoon(){},locationLine(){},hasLocation(){}}
      :name.endsWith('i18n.js')?{t:x=>x}:{};
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});
  });
  await module.evaluate();
  return {run:module.namespace.runTurn,calls:()=>calls};
}
test('legacy caller cannot bypass default-off remote policy',async()=>{
  for(const flag of [undefined,false,'true',1]){
    const f=await fixture(flag),history=[{role:'user',content:'count'}];
    await assert.rejects(f.run(history,{remote:true}),/Vanjski AI je isključen/);
    assert.equal(f.calls(),0);assert.equal(history.length,1);
  }
});
test('legacy client requires explicit remote turn even if configured',async()=>{
  const f=await fixture(true);
  await assert.rejects(f.run([]),/Vanjski AI je isključen/);
  assert.equal(f.calls(),0);
  assert.equal(await f.run([],{remote:true}),'synthetic');
  assert.equal(f.calls(),1);
});
