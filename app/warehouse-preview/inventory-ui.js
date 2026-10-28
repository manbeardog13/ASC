// UI selectors for real records. These never create inventory or location data.
export const BUILDING_SPACES = Object.freeze([
  { id:'house-ground', name:'Kuća · prizemlje' },
  { id:'house-platform', name:'Kuća · drvena platforma' },
  { id:'house-attic', name:'Kuća · potkrovlje' },
  { id:'attic-parts', name:'Potkrovlje · bijele police' },
  { id:'attic-racks', name:'Potkrovlje · regali i platforma' },
  { id:'triangular-store', name:'Trokutasto spremište' },
]);

const normalize = value => String(value ?? '').replace(/[đĐ]/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('hr').trim();
export function searchLiveSets(rows, query) {
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  if(!terms.length||!Array.isArray(rows))return [];
  return rows.filter(row=>{
    if(!row||row.deleted_at)return false;
    const text=normalize([row.public_code,row.id,row.vehicle?.plate,row.vehicle?.customer?.name,
      row.zone,row.rack,row.shelf,row.slot,...(Array.isArray(row.tires)?row.tires.flatMap(t=>[t?.id,t?.brand,t?.model,t?.size,t?.dot_code]):[])].filter(Boolean).join(' '));
    return terms.every(term=>text.includes(term));
  });
}

export function recordLinks(row) {
  const code=row?.public_code, customerId=row?.vehicle?.customer?.id;
  return {
    detail:code?`../set-detail.html?code=${encodeURIComponent(code)}`:null,
    customer:customerId?`../customers.html?id=${encodeURIComponent(customerId)}`:null,
    checkout:code?`../checkout.html?set=${encodeURIComponent(code)}`:null,
    place:code?`../place.html?set=${encodeURIComponent(code)}`:null,
  };
}

// Bind only backend-confirmed remote IDs. Reject unknown or duplicate pairs;
// local zone labels and array order must never guess a physical room.
export function buildingAreaBindings(areas, bindings) {
  const map={}, allowed=new Set(BUILDING_SPACES.map(s=>s.id));
  const candidates=(Array.isArray(bindings)?bindings:[]).filter(b=>b?.warehouse==='main'&&allowed.has(b.space_id)&&b.area_id);
  for(const binding of candidates){
    const matching=(areas||[]).filter(a=>a.remoteId===binding.area_id);
    if(matching.length!==1||candidates.filter(b=>b.area_id===binding.area_id).length!==1||candidates.filter(b=>b.space_id===binding.space_id).length!==1)continue;
    map[matching[0].id]=binding.space_id;
  }
  return map;
}

export function placementReason(reason) {
  const labels={
    'unmapped-area':'Zona još nema prostorni raspored.', 'unmapped-rack':'Regal još nema položaj na karti.',
    'outside-warehouse':'Komplet pripada drugom skladištu.', 'invalid-quantity':'Količina nije potvrđena.',
    'location-mismatch':'Adresa kompleta ne odgovara zapisu mjesta.', 'ambiguous-location':'Mjesto nije jednoznačno.',
    'location-id-not-found':'Povezano mjesto nije dostupno.', 'location-not-found':'Mjesto nije pronađeno.',
    'blocked-location':'Mjesto je blokirano.', 'scene-budget-exceeded':'Komplet prelazi kapacitet ovog prikaza.',
    'ambiguous-rack':'Više stupaca koristi isti regal.', 'ambiguous-area':'Zona ima više rasporeda.',
  };
  return labels[reason]||'Položaj kompleta nije potvrđen za 3D prikaz.';
}
