import test from 'node:test';
import assert from 'node:assert/strict';
import { proposals, navigationForText, pageFromPath } from '../app/workflow-model.js';
import { setWorkflowContext, registerWorkflowAction, runWorkflowAction } from '../app/workflow.js';

const set = { public_code:'ASC-2026-0042', status:'in_storage', vehicle:{customer:{id:'customer-42'}} };
const available = ['intake-next','print','confirm-place','suggest-place','confirm-checkout','type-code','search','find-customer','enter-plate'];
const context = {role:'employee',set};
test('one set keeps its identity from saved intake through placement and pickup', () => {
  const intake = proposals({...context,page:'checkin',step:3},available);
  assert.equal(intake.actions[0].href,'place.html?set=ASC-2026-0042');
  const placement = proposals({...context,page:'place',slotQr:'A-01'},available);
  assert.equal(placement.actions[0].command,'confirm-place');
  assert.equal(placement.actions[2].href,'set-detail.html?code=ASC-2026-0042');
  const stored = proposals({...context,page:'set-detail',set:{...set,location_id:'slot-1'}},available);
  assert.equal(stored.actions[0].href,'checkout.html?set=ASC-2026-0042');
  const complete = proposals({...context,page:'checkout',set:{...set,status:'checked_out'}},available);
  assert.ok(!complete.actions.some(a => a.command === 'confirm-checkout'));
});
test('unknown, pending and readonly roles never receive a write proposal', () => {
  for (const role of [null,'readonly','pending','blocked']) for (const page of ['dashboard','checkin','set-detail','place','checkout','customers','locations']) {
    const result = proposals({...context,role,page,step:2,slotQr:'A-01'},available);
    assert.ok(result.actions.every(a => !a.write),role + ':' + page);
    assert.ok(result.actions.length > 0 && result.actions.length <= 3);
  }
});
test('availability is never inferred and missing page handlers are never offered', () => {
  const fresh = proposals({...context,page:'place'},available);
  assert.equal(fresh.actions[0].command,'suggest-place');
  const noHandlers = proposals({...context,page:'checkout'},[]);
  assert.ok(noHandlers.actions.every(a => a.href));
  const noSlots = proposals({...context,page:'place',noSlots:true},available);
  assert.match(noSlots.actions[0].href,/^locations.html\?return=/);
  const trial = proposals({...context,page:'spatial'},available);
  assert.match(trial.title,/probne podatke/);
  assert.ok(trial.actions.every(a => !a.write));
});
test('explicit navigation is instant while questions and transaction requests reach the existing agent', () => {
  assert.equal(navigationForText('Pronađi komplet','employee').href,'locate.html');
  assert.equal(navigationForText('Zaprimi novi set','employee').href,'checkin.html');
  assert.equal(navigationForText('Zaprimi novi set','readonly'),null);
  for (const text of ['Kako zaprimiti novi set?','Obriši komplet','Plati sve','Koliko je slobodno?','https://example.com']) assert.equal(navigationForText(text,'admin'),null);
  assert.equal(pageFromPath('/ASC/app/warehouse-preview/index.html'),'spatial');
});
test('a running command cannot double-apply and an unknown command cannot run', async () => {
  setWorkflowContext({...context,page:'checkout'});
  let finish, calls = 0;
  registerWorkflowAction('confirm-checkout', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = runWorkflowAction('confirm-checkout');
  assert.equal(await runWorkflowAction('confirm-checkout'),false);
  assert.equal(await runWorkflowAction('delete-everything'),false);
  finish(); await first;
  assert.equal(calls,1);
});
