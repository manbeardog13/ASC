// Renders one composer from a studio composer template. Pure DOM, no globals.
// hosts maps a template node kind to an existing element (or array of elements)
// that a surface already owns and has wired. Hosts are adopted into the
// template's structure. Kinds with no host get a template default control.
const SHOW_LABEL={'composer-model':true,'composer-mode':true,'composer-stop':true};
function defaultControl(document,node,template){
  if(node.kind==='composer-input'){const t=document.createElement('textarea');t.rows=1;t.placeholder=node.value;t.setAttribute('aria-label',node.label);return t;}
  if(node.kind==='composer-context')return null;
  if(node.kind==='composer-stop')return null;
  const b=document.createElement('button');b.type='button';
  b.textContent=node.value;
  if(!SHOW_LABEL[node.kind])b.setAttribute('aria-label',node.label);
  b.dataset.composerDefault=node.kind;
  // Only the / command has local behaviour (it inserts a slash into the draft).
  // Any other control the surface does not own is shown, but disabled, so the
  // composer never offers an action that does nothing.
  if(node.kind!=='composer-command'){b.disabled=true;b.title=node.label+' is not available here yet';}
  return b;
}
export function renderComposer({document,template,hosts={},surface='unknown'}){
  if(!template||template.family!=='composer')throw Error('renderComposer needs a composer template');
  const used=new Set();
  const rootEl=document.createElement('div');
  rootEl.className='sc-root';
  rootEl.dataset.studioComposer=template.id;
  rootEl.dataset.plan=template.plan;
  rootEl.dataset.surface=surface;
  rootEl.dataset.disclosure=template.interaction.disclosure;
  rootEl.setAttribute('role',template.semantics.role);
  rootEl.setAttribute('aria-label',template.semantics.label);
  const look=template.look||{};
  const vars={'--composer-base':look.base,'--composer-base-raised':look.baseRaised,'--composer-edge':look.edge,'--composer-text':look.text,'--composer-text-muted':look.textMuted,'--composer-ring-a':look.ringA,'--composer-ring-b':look.ringB,'--composer-ring-c':look.ringC,'--composer-bubble':look.bubble,'--composer-ring-period':look.ringPeriod};
  for(const [k,v] of Object.entries(vars))if(typeof v==='string'&&v)rootEl.style.setProperty(k,v);
  const ring=document.createElement('div');ring.className='sc-ring';ring.setAttribute('aria-hidden','true');
  const body=document.createElement('div');body.className='sc-body';
  body.dataset.mode=template.layout.mode;body.dataset.direction=template.layout.direction;
  rootEl.append(ring,body);
  const slots={};
  const build=(entries,parent,depth)=>{
    for(const entry of entries){
      if(entry.node===true){
        const host=hosts[entry.kind];
        const list=(Array.isArray(host)?host:host?[host]:[]).filter(Boolean);
        const slot=document.createElement('span');slot.className='sc-slot';slot.dataset.kind=entry.kind;
        if(list.length){list.forEach(el=>{used.add(el);slot.append(el);});}
        else{const d=defaultControl(document,entry,template);if(d)slot.append(d);else slot.hidden=true;}
        slots[entry.kind]=slot;parent.append(slot);
      }else{
        const g=document.createElement('div');g.className='sc-group';g.dataset.axis=entry.axis;g.dataset.group=entry.label;
        if(/^(Revealed|Overflow)/.test(entry.label))g.dataset.reveal='true';
        build(entry.children,g,depth+1);parent.append(g);
      }
    }
  };
  build(template.composition.tree,body,0);
  return {element:rootEl,slots,adopted:used};
}
