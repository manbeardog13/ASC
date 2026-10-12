import { AREAS } from './model.js';
import { matchScore } from '../agent-search.js';

export const normalizeCroatian = value => String(value ?? '').replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const normalizeSetId = value => String(value ?? '').trim().toUpperCase();
export const customerLabel = value => String(value ?? '').replace(/^(Demo|Primjer)\s+/i, '');

export function parseCroatianIntent(text) {
  const raw = String(text ?? '').trim();
  const command = normalizeCroatian(raw).replace(/[.!?]+$/,'').replace(/^(molim\s+)?(otvori|pokazi|prikazi|odi na|idi na)\s+/, '');
  if (/^(kuca|kucu|pregled|pregled kuce|sva skladista)$/.test(command)) return { kind: 'area', value: 'all' };
  const names = { prizemlje:'2.1', 'drvena platforma':'2.2', 'drvenu platformu':'2.2', platforma:'2.2', platformu:'2.2', potkrovlje:'2.3' };
  if (names[command]) return { kind:'area', value:names[command] };
  const n = command.replace(/^skladiste\s+/, '').match(/^(?:2\s*[.,]\s*|dva\s+(?:tocka\s+)?)(1|2|3|jedan|dva|tri)$/);
  if (n) return { kind:'area', value:'2.'+({jedan:'1',dva:'2',tri:'3'}[n[1]]||n[1]) };
  const query = raw.replace(/^(molim\s+)?(pronađi|pronadi|nađi|nadi|potraži|potrazi|pokaži|pokazi|prikaži|prikazi)\s+/i, '').replace(/^(gume|komplet)\s+(za\s+)?/i, '').trim();
  return { kind:'search', query };
}

function includesQuery(values, query) {
  return matchScore(values, query) !== null;
}
export function searchLocations(state, query) {
  if (!String(query).trim()) return [];
  const setId=normalizeSetId(query);
  const bySet=state.tires.some(t=>normalizeSetId(t.setId)===setId);
  const tires=new Map(state.tires.map(t=>[t.id,t]));
  return state.stacks.flatMap(stack=>{
    const area=AREAS.find(a=>a.id===stack.areaId);
    const matchedTires=stack.tireIds.map(id=>tires.get(id)).filter(t=>t && (bySet?normalizeSetId(t.setId)===setId:includesQuery([t.customer,t.plate,t.code,t.id,t.brand,t.size],query)));
    const locationMatch=!bySet && includesQuery([stack.id,stack.areaId,area?.name],query);
    if (!matchedTires.length && !locationMatch) return [];
    const first=matchedTires[0];
    return [{stack,area,matchedTires,title:first?customerLabel(first.customer):stack.id,
      detail:first?`${bySet?first.setId+' · ':''}${first.plate} · ${first.size}`:`${stack.tireIds.length} od ${stack.capacity} mjesta`}];
  });
}
export function tutorialExample(state, preferredArea='2.3') {
  return state.stacks.find(s=>s.areaId===preferredArea && s.tireIds.length) || state.stacks.find(s=>s.tireIds.length) || state.stacks[0] || null;
}
