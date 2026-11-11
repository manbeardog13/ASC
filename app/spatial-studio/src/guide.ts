import {rooms} from './rooms.ts';

export const steps = [
  {short:'Prostor', title:'Upoznajte prostor', icon:'cube',
   instruction:'Krenite u obilazak. Pronađite ulaz, prolaz i regal kojem želite prići.',
   check:'Dok mjere nisu potvrđene, položaj provjerite u samom skladištu.'},
  {short:'Mjesto', title:'Označite mjesto', icon:'scan',
   instruction:'Upišite oznake s regala redom: zona, regal, polica, mjesto. Odaberite „Stvori mjesta” i ispišite QR naljepnice.',
   check:'Usporedite ispisanu oznaku sa stvarnim mjestom. Naljepnicu pričvrstite ondje gdje je djelatnik može skenirati.'},
  {short:'Regal', title:'Ucrtajte regal', icon:'rack',
   instruction:'Na tlocrtu odaberite položaj na podu. Povežite ga s evidentiranim regalom i unesite njegov provjereni kapacitet.',
   check:'Prolaz mora ostati slobodan. Nosivost i dopušteni način slaganja provjerite na oznaci regala i prema uputama radionice.'},
  {short:'Prijam', title:'Označite komplet', icon:'layers',
   instruction:'U zaprimanje unesite vozilo, kupca, broj guma i dimenzije. Spremite komplet pa ispišite njegovu QR naljepnicu.',
   check:'Usporedite oznaku kompleta i registraciju sa zapisom. Pričvrstite čitljivu naljepnicu na odgovarajući komplet.'},
  {short:'Smještaj', title:'Potvrdite smještaj', icon:'target',
   instruction:'Očitajte QR kompleta, a zatim QR stvarnog mjesta. Ako dolazite iz zaprimanja, komplet je već odabran.',
   check:'Provjerite slobodan prostor i kapacitet. Smjestite gume prema pravilima regala pa potvrdite prikazanu adresu u aplikaciji.'},
  {short:'Pronalazak', title:'Pronađite gume', icon:'search',
   instruction:'Potražite registraciju, kupca ili oznaku kompleta. Otvorite zapis i slijedite adresu od zone do regala, police i mjesta.',
   check:'Na mjestu usporedite QR na kompletu s traženim zapisom. Izdavanje potvrdite tek kada komplet predate.'},
] as const;

export function guideEntry(search: string) {
  const params = new URLSearchParams(search);
  const number = params.get('guide');
  const step = number && /^[1-6]$/.test(number) ? Number(number) : null;
  const room = rooms.find(r => r.id === params.get('room'))?.id;
  return {step, room};
}

// Only public architectural identifiers travel between pages.
export function guideParams(step: number, room: string) {
  const params = new URLSearchParams({guide: String(step)});
  if (rooms.some(r => r.id === room)) params.set('room', room);
  return params;
}

export function guideTaskLink(page: 'locations'|'checkin'|'place'|'locate'|'scan', step: number, room: string, zone: string) {
  const params = guideParams(step, room);
  if (page === 'locations') params.set('zone', zone);
  return '../' + page + '.html?' + params;
}

export function rememberStudio(room:string, step?:number) {
  const params=guideParams(step??1,room);
  if (!step) {
    params.delete('guide');
    const requested=new URLSearchParams(location.search).get('find');
    if (requested && /^[a-zA-Z0-9_-]{1,80}$/.test(requested)) params.set('find',requested);
  }
  try {
    sessionStorage.setItem('asc.return','spatial-studio/index.html'+(params.size?'?'+params:''));
  } catch { /* The sign-in link still works when tab storage is unavailable. */ }
}
