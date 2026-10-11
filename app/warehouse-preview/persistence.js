import { validateState } from './model.js';
export class LocalSaveError extends Error {}
/** A browser Web Lock serializes the read/check/write across tabs on this origin. */
export async function saveOperation({key,storage,locks,expected,operation,recover=false}) {
  if(!locks?.request)throw new LocalSaveError('Za sigurno spremanje otvorite prikaz u novijem pregledniku. Pretraga i pregled i dalje rade.');
  try {
    return await locks.request(key+'.write', {mode:'exclusive'}, ()=>{
      let raw,saved=null,valid=true;
      try {raw=storage.getItem(key);}catch {throw new LocalSaveError('Spremljene podatke nije moguće pročitati. Promjena nije spremljena.');}
      if(raw!==null){
        try {saved=JSON.parse(raw);valid=Boolean(saved)&&validateState(saved).valid;}catch {valid=false;}
      }
      if(!valid&&!recover)throw new LocalSaveError('Spremljeni podaci nisu valjani. Preuzmite izvorni zapis pa vratite početni raspored.');
      if(valid&&saved&&saved.revision!==expected.revision){const error=new LocalSaveError('Podaci su promijenjeni u drugoj kartici. Ponovite radnju nakon osvježavanja.');error.latest=saved;throw error;}
      const revision=Number.isSafeInteger(saved?.revision)&&saved.revision>=0?saved.revision:0;
      const current=valid&&saved?saved:{...expected,revision:Math.max(expected.revision,revision)};
      let next;
      try {next=operation(current);}catch(error){throw new LocalSaveError(error.message||'Promjena nije valjana.');}
      const result=validateState(next);if(!result.valid)throw new LocalSaveError(result.errors[0]||'Promjena nije valjana.');
      if(next.revision<=current.revision)throw new LocalSaveError('Verzija promjene nije valjana.');
      try{storage.setItem(key,JSON.stringify(next));}catch {throw new LocalSaveError('Nema mjesta za spremanje. Promjena nije spremljena. Preuzmite postojeće podatke.');}
      return next;
    });
  }catch(error){
    if(error instanceof LocalSaveError)throw error;
    throw new LocalSaveError('Spremanje nije dostupno. Promjena nije spremljena. Pokušajte ponovno.');
  }
}
