import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {guideEntry, guideTaskLink, steps} from '../src/guide.ts';
import {taskGuideReturn} from '../../studio-guide-return.js';

const base='https://app.nerosummit.com/ASC/app/';
const studio=base+'spatial-studio/index.html';
test('every guide action stays within the deployed ASC app and leads to a real page', async()=>{
  assert.equal(steps.length,6);
  for(const [page,step] of [['locations',2],['checkin',4],['place',5],['locate',6],['scan',6]]) {
    const link=guideTaskLink(page,step,'triangular-store','TROKUT');
    const url=new URL(link,studio);
    assert.equal(url.pathname,'/ASC/app/'+page+'.html');
    assert.equal(url.searchParams.get('guide'),String(step));
    assert.equal(url.searchParams.get('zone'),page==='locations'?'TROKUT':null);
    const context=taskGuideReturn(url.href,studio,null);
    assert.deepEqual(guideEntry(context),{room:'triangular-store',step});
    await access(new URL('../../'+page+'.html',import.meta.url));
  }
});
test('guide handoffs propagate only enumerated steps and public rooms across known task pages',()=>{
  const saved='guide=4&room=attic-parts&code=private';
  assert.equal(taskGuideReturn(base+'place.html?set=private',base+'checkin.html',saved),'guide=4&room=attic-parts');
  for(const previous of [base+'dashboard.html', 'https://unrelated.invalid/app/checkin.html','https://app.nerosummit.com/OTHER/app/checkin.html']) {
    assert.equal(taskGuideReturn(base+'place.html?set=private',previous,saved),null);
  }
  assert.equal(taskGuideReturn(base+'checkin.html?guide=22',studio,null),null);
  assert.equal(taskGuideReturn(base+'dashboard.html?guide=1',studio,null),null);
  assert.equal(taskGuideReturn(base+'locate.html?guide=6&room=area:other&code=private',studio,null),'guide=6');
  assert.deepEqual(guideEntry('?guide=-1&room=area:private'),{step:null,room:undefined});
  assert.deepEqual(guideEntry('?guide=1'),{step:1,room:undefined});
});
