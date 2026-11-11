// Presentation never supplies room geometry, inventory or physical dimensions.
// An inspection stays neutral; dusk is an exterior atmosphere only by default.
export const PRESENTATION_MODES = Object.freeze(['auto', 'studio', 'dusk']);
export const PRESENTATION_PRESETS = Object.freeze({
  studio: Object.freeze({ background: 0x20262c, exposure: 1.12, sky: 0xd3dce9, ground: 0x6c6660, skyIntensity: 1.75, sun: 0xffe0c1, sunIntensity: 2.35, fill: 0xc4d5ef, fillIntensity: 1.25, environmentIntensity: .38 }),
  dusk: Object.freeze({ background: 0x111927, exposure: 1.18, sky: 0x9eb4df, ground: 0x272737, skyIntensity: .95, sun: 0xf4aa7c, sunIntensity: .82, fill: 0x88a9e0, fillIntensity: 1.15, environmentIntensity: .48 }),
});

export function resolvePresentation(mode, { buildingEnabled = false, view = null, focused = false, areaId = 'all' } = {}) {
  if (mode === 'studio' || mode === 'dusk') return mode;
  return buildingEnabled && !focused && areaId === 'all' && (!view || ['all', 'building', 'exterior'].includes(view)) ? 'dusk' : 'studio';
}

// Solve all eight corners in camera space. Width/aspect alone omits projected
// room depth and clips a long oblique building on narrow phones.
export function fitPerspectiveBounds(bounds, { direction = [-.7,.9,1], aspect = 1, fov = 38, padding = .82 } = {}) {
  if (!bounds || ![bounds.min,bounds.max,direction].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)) || !Number.isFinite(aspect) || aspect<=0 || !(fov>0&&fov<180) || !(padding>0&&padding<=1) || bounds.min.some((v,i)=>v>bounds.max[i])) throw new RangeError('Invalid camera bounds');
  const length=Math.hypot(...direction);if(!length)throw new RangeError('Invalid camera direction');
  const forward=direction.map(v=>v/length),horizontal=Math.hypot(forward[0],forward[2]);
  const right=horizontal>1e-9?[forward[2]/horizontal,0,-forward[0]/horizontal]:[1,0,0];
  const up=[forward[1]*right[2]-forward[2]*right[1],forward[2]*right[0]-forward[0]*right[2],forward[0]*right[1]-forward[1]*right[0]];
  const target=bounds.min.map((v,i)=>(v+bounds.max[i])/2),tanY=Math.tan(fov*Math.PI/360)*padding,tanX=tanY*aspect;
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  let distance=1;
  for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){
    const p=[x-target[0],y-target[1],z-target[2]];
    distance=Math.max(distance,dot(p,forward)+Math.max(Math.abs(dot(p,right))/tanX,Math.abs(dot(p,up))/tanY)+.1);
  }
  return {target,position:target.map((v,i)=>v+forward[i]*distance),distance};
}

export function isHierarchyVisible(object) {
  for(let current=object;current;current=current.parent)if(current.visible===false)return false;
  return !!object;
}

export function orbitDistance(bounds, aspect, fov = 38, padding = .82) {
  // A bounding sphere remains inside the screen throughout the full orbit,
  // including the narrow side of a portrait viewport.
  fitPerspectiveBounds(bounds,{aspect,fov,padding});
  const radius=Math.hypot(...bounds.max.map((v,i)=>(v-bounds.min[i])/2));
  const halfAngle=Math.atan(Math.tan(fov*Math.PI/360)*Math.min(1,aspect)*padding);
  return Math.max(1,radius/Math.sin(halfAngle));
}

// Small deterministic, local equirectangular reflection map. Wide soft sources
// create readable metal/clearcoat highlights without fictitious lamps or an HDR
// network dependency. This is a lighting environment, not photographed scenery.
export function environmentPixels(mode = 'studio', width = 256, height = 128) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || width > 512 || height < 4 || height > 256) throw new RangeError('Invalid environment size');
  const dusk = mode === 'dusk', pixels = new Uint8Array(width * height * 4);
  const sky = dusk ? [45, 67, 108] : [173, 190, 210];
  const horizon = dusk ? [153, 108, 100] : [218, 214, 204];
  const ground = dusk ? [29, 32, 44] : [83, 87, 93];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = (y + .5) / height, u = (x + .5) / width;
    const blend = v < .5 ? Math.pow(v * 2, 2) : Math.pow((v - .5) * 2, .45);
    const a = v < .5 ? sky : horizon, b = v < .5 ? horizon : ground;
    const lobe = (at, spread) => Math.exp(-Math.pow(Math.min(Math.abs(u - at), 1 - Math.abs(u - at)) / spread, 2)) * Math.exp(-Math.pow((v - .32) / .16, 2));
    const soft = lobe(.16, .12) * (dusk ? 58 : 52) + lobe(.68, .055) * (dusk ? 30 : 38);
    const i = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) pixels[i + channel] = Math.round(Math.min(255, a[channel] + (b[channel] - a[channel]) * blend + soft));
    pixels[i + 3] = 255;
  }
  return { pixels, width, height };
}
