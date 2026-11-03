import {useEffect, useRef} from 'react';
import {Icon} from './Icon';
import {rememberStudio, guideTaskLink, steps} from './guide';
import type {Snapshot} from './data';
import './guide.css';

type Props = {
  step:number; room:string; zone:string; name:string; status:Snapshot['status'];
  canAdd:boolean; hasRacks:boolean; hasLocations:boolean; custom:boolean;
  change:(step:number)=>void; close:()=>void; explore:()=>void; mapRack:()=>void;
};
export function Guide({step,room,zone,name,status,canAdd,hasRacks,hasLocations,custom,change,close,explore,mapRack}:Props) {
  const current=steps[step-1];
  const title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{ title.current?.focus({preventScroll:true}); },[step]);
  const link=(page:Parameters<typeof guideTaskLink>[0])=>guideTaskLink(page,step,room,zone);
  let action;
  if(step===1) {
    action=<button className="primary" onClick={explore}>{custom?'Otvori tlocrt':'Započni obilazak'} <Icon name="arrow" size={16}/></button>;
  } else if(status==='signed-out') {
    action=<a className="primary" href="../login.html" onClick={()=>rememberStudio(room,step)}>Prijava djelatnika <Icon name="arrow" size={16}/></a>;
  } else if(status!=='online') {
    action=<p className="guide-state" role="status">{status==='forbidden'?'Za ovaj postupak potrebne su ovlasti osoblja.':status==='loading'?'Provjeravamo pristup evidenciji…':'Za rad s evidencijom potrebna je veza. Vodič možete nastaviti čitati.'}</p>;
  } else if(step===3 && (canAdd||hasRacks||hasLocations)) {
    action=<button className="primary" onClick={mapRack}>{canAdd?'Ucrtaj regal':'Otvori tlocrt'} <Icon name="arrow" size={16}/></button>;
  } else {
    const page=step===2||step===3?'locations':step===4?'checkin':step===5?'place':'locate';
    const label={locations:step===3?'Najprije stvori mjesto':'Otvori mjesta i QR oznake',checkin:'Zaprimi komplet',place:'Smjesti komplet',locate:'Pronađi komplet'}[page];
    action=<><a className="primary" href={link(page)}>{label} <Icon name="arrow" size={16}/></a>
      {step===6&&<a className="action-link" href={link('scan')}><Icon name="scan" size={16}/> Skeniraj naljepnicu</a>}</>;
  }
  return <div className="warehouse-guide">
    <div className="guide-location"><Icon name="cube" size={14}/>{name} · zona {zone}</div>
    <nav aria-label="Koraci vodiča" className="guide-steps">{steps.map((s,i)=><button type="button" key={s.short}
      aria-current={step===i+1?'step':undefined} aria-label={'Korak '+(i+1)+': '+s.short}
      onClick={()=>change(i+1)}><span>{i+1}</span></button>)}</nav>
    <article className="guide-page" key={step}>
      <div className="eyebrow"><Icon name={current.icon} size={15}/> Korak {step} od {steps.length}</div>
      <h3 tabIndex={-1} ref={title}>{current.title}</h3>
      <p>{current.instruction}</p>
      <p className="guide-check">{current.check}</p>
      <div className="guide-actions">{action}</div>
    </article>
    <div className="guide-pagination"><button className="sub-link" disabled={step===1} onClick={()=>change(step-1)}><Icon name="back" size={15}/> Prethodno</button>
      <button className="sub-link" onClick={()=>step===steps.length?close():change(step+1)}>{step===steps.length?'Završi vodič':'Sljedeće'} <Icon name="arrow" size={15}/></button></div>
  </div>;
}
