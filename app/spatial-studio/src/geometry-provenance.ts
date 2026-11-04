/** Recorded layout units do not certify the physical architectural model. */
export function geometryProvenance(architectural: boolean, unit?: 'grid'|'m') {
 if(architectural)return {
  kind:'schematic' as const,
  label:'Shematski prikaz',
  detail:unit==='m'
   ? 'raspored u metrima; geometrija i spojevi nisu potvrđeni'
   : 'mjere i spojevi nisu potvrđeni',
 };
 return {
  kind:'recorded-layout' as const,
  label:'Tlocrt prema evidenciji',
  detail:unit==='m'?'dimenzije rasporeda u metrima':'dimenzije rasporeda u poljima mreže',
 };
}
