// Keep navigation in SVG coordinates so placement and hit testing use the same
// transform as the drawing, including the letterbox on tall or wide displays.
export function attachPlanCamera(svg, previous) {
  const origin = svg.viewBox.baseVal;
  const home = {x: origin.x, y: origin.y, width: origin.width, height: origin.height};
  const point = (clientX, clientY) => {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
  };
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  function set(x, y, width) {
    const height = width * home.height / home.width;
    // Even at maximum magnification every edge can reach the screen centre.
    x = clamp(x + width/2, home.x, home.x + home.width) - width/2;
    y = clamp(y + height/2, home.y, home.y + home.height) - height/2;
    svg.setAttribute('viewBox', [x, y, width, height].join(' '));
  }
  function move(from, to, factor = 1) {
    const anchor = point(from.x, from.y), dest = point(to.x, to.y);
    if (!anchor || !dest) return;
    const view = svg.viewBox.baseVal;
    const width = clamp(view.width * factor, home.width/10, home.width*1.8);
    const ratio = width / view.width;
    set(anchor.x + (view.x - dest.x)*ratio, anchor.y + (view.y - dest.y)*ratio, width);
  }
  const center = () => {
    const rect = svg.getBoundingClientRect();
    return {x: rect.left + rect.width/2, y: rect.top + rect.height/2};
  };
  const pointers = new Map();
  let start, moved = false;
  const gesture = () => {
    const [a,b] = pointers.values();
    return b ? {x: (a.x+b.x)/2, y: (a.y+b.y)/2, span: Math.max(1, Math.hypot(b.x-a.x, b.y-a.y))} : a;
  };
  const listeners = new AbortController();
  function on(event, handler, options) {
    svg.addEventListener(event, handler, {...options, signal: listeners.signal});
  }
  on('pointerdown', e => {
    if (e.button !== 0) return;
    const p = {x: e.clientX, y: e.clientY};
    if (!pointers.size) { start = p; moved = false; }
    else moved = true;
    pointers.set(e.pointerId, p);
    // Capture on the object under the finger so taps still select individual racks.
    e.target.setPointerCapture(e.pointerId);
  });
  on('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const before = gesture();
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    const after = gesture();
    if (!moved && Math.hypot(after.x-start.x, after.y-start.y) <= 5) return;
    const from = moved ? before : start;
    moved = true;
    move(from, after, before.span && after.span ? before.span/after.span : 1);
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    on(event, e => pointers.delete(e.pointerId));
  }
  on('click', e => {
    if (moved && e.detail !== 0) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, {capture:true});
  on('wheel', e => {
    e.preventDefault();
    const p = {x:e.clientX, y:e.clientY};
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? svg.clientHeight : 1);
    move(p, p, Math.exp(clamp(pixels * .0016, -.7, .7)));
  }, {passive:false});
  const api = {
    reset: () => set(home.x, home.y, home.width),
    zoom: direction => { const p = center(); move(p, p, direction > 0 ? .8 : 1.25); },
    snapshot: () => { const v = svg.viewBox.baseVal; return {x:v.x,y:v.y,width:v.width}; },
    dispose: () => listeners.abort()
  };
  on('keydown', e => {
    if (e.target !== svg || e.ctrlKey || e.metaKey || e.altKey) return;
    const delta = {ArrowLeft:[40,0], ArrowRight:[-40,0], ArrowUp:[0,40], ArrowDown:[0,-40]}[e.key];
    if (delta) { const p = center(); move(p, {x:p.x+delta[0], y:p.y+delta[1]}); }
    else if (e.key === '+' || e.key === '=') api.zoom(1);
    else if (e.key === '-') api.zoom(-1);
    else if (e.key === 'Home') api.reset();
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  if (previous) set(previous.x, previous.y, previous.width);
  return api;
}
