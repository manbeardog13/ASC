import * as THREE from './vendor/three.module.js';

// Illustrative surface families only: never infer a real tyre's type, age or
// condition from these appearances. Inventory identity alone selects the art.
export const TYRE_VARIANTS = Object.freeze([
  Object.freeze({ key: 'uzduzni', color: 0x414548, roughness: .90, treadRoughness: .96, bumpScale: .017 }),
  Object.freeze({ key: 'lamele', color: 0x383c3e, roughness: .97, treadRoughness: 1, bumpScale: .022 }),
  Object.freeze({ key: 'usmjereni', color: 0x323638, roughness: .83, treadRoughness: .88, bumpScale: .019 }),
  Object.freeze({ key: 'blokovi', color: 0x444644, roughness: .95, treadRoughness: .99, bumpScale: .025 }),
]);

export function tyreAppearance(id) {
  let hash = 2166136261;
  for (const character of String(id ?? '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return {
    variant: hash % TYRE_VARIANTS.length,
    rotation: ((hash >>> 2) / 0x40000000) * Math.PI * 2,
    brightness: .92 + ((hash >>> 16) / 65535) * .12,
  };
}

// A decorative sample of surrounding ground, never a floor or measured apron.
// The centre is genuinely empty, so it cannot infill the building or attic gaps.
export function createSurroundingsGeometry(rect) {
  if (!rect || ![rect.x, rect.z, rect.w, rect.d].every(Number.isFinite) || rect.w <= 0 || rect.d <= 0) return null;
  const inset = .16, border = .45;
  const innerX = rect.w / 2 + inset, innerZ = rect.d / 2 + inset;
  const outerX = innerX + border, outerZ = innerZ + border;
  const points = [
    [-outerX, -outerZ], [outerX, -outerZ], [outerX, outerZ], [-outerX, outerZ],
    [-innerX, -innerZ], [innerX, -innerZ], [innerX, innerZ], [-innerX, innerZ],
  ];
  const positions = [], uvs = [], indices = [];
  for (const [x, z] of points) {
    positions.push(x + rect.x, -.22, z + rect.z);
    uvs.push((x + rect.x) / 1.4, (z + rect.z) / 1.4);
  }
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4;
    indices.push(side, side + 4, next, next, side + 4, next + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function seededRandom(seed) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

function repeatTexture(texture, color = false) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function surface(width, height, draw, { roughness = [.76, .98], metallic = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Materijali se nisu mogli pripremiti. Ponovno otvorite 3D prikaz.');
  draw(ctx, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const heights = new Uint8Array(pixels.length), rough = new Uint8Array(pixels.length);
  const metal = metallic ? new Uint8Array(pixels.length) : null;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
    const rust = metallic && pixels[i] > pixels[i + 1] * 1.18 && pixels[i] > pixels[i + 2] * 1.45;
    const r = rust ? .96 : roughness[0] + (1 - luminance / 255) * (roughness[1] - roughness[0]);
    heights[i] = heights[i + 1] = heights[i + 2] = luminance;
    rough[i] = rough[i + 1] = rough[i + 2] = Math.round(r * 255);
    heights[i + 3] = rough[i + 3] = 255;
    if (metal) {
      metal[i] = metal[i + 1] = metal[i + 2] = rust ? 10 : 224;
      metal[i + 3] = 255;
    }
  }
  const dataMap = (data) => {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    // Match CanvasTexture's vertical orientation so grooves and highlights agree.
    texture.flipY = true;
    return repeatTexture(texture);
  };
  const bundle = {
    map: repeatTexture(new THREE.CanvasTexture(canvas), true),
    bumpMap: dataMap(heights), roughnessMap: dataMap(rough),
  };
  if (metal) bundle.metalnessMap = dataMap(metal);
  return bundle;
}

function speckle(ctx, width, height, random, count, opacity = .055, size = 1.5) {
  for (let i = 0; i < count; i++) {
    const shade = random() > .5 ? 255 : 20;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${random() * opacity})`;
    const radius = .3 + random() * size;
    ctx.fillRect(random() * width, random() * height, radius, radius);
  }
}

function drawWood(ctx, w, h) {
  const random = seededRandom(122);
  ctx.fillStyle = '#b99973'; ctx.fillRect(0, 0, w, h);
  for (let board = 0; board < 8; board++) {
    const y = board * h / 8, boardHeight = h / 8;
    ctx.fillStyle = `rgba(${100 + Math.floor(random() * 80)},105,60,${.08 + random() * .16})`;
    ctx.fillRect(0, y, w, boardHeight);
    ctx.fillStyle = 'rgba(52,38,26,.57)'; ctx.fillRect(0, y, w, 2);
    ctx.fillStyle = 'rgba(244,221,177,.25)'; ctx.fillRect(0, y + 2, w, 1);
    for (let grain = 0; grain < 45; grain++) {
      const gy = y + 4 + random() * (boardHeight - 8);
      ctx.strokeStyle = `rgba(65,43,24,${.035 + random() * .08})`;
      ctx.lineWidth = .4 + random() * 1.0; ctx.beginPath();
      ctx.moveTo(0, gy); ctx.bezierCurveTo(w * .25, gy + random() * 9, w * .7, gy - random() * 9, w, gy);
      ctx.stroke();
    }
    const join = board % 2 ? w * .31 : w * .76;
    ctx.fillStyle = 'rgba(40,30,21,.38)'; ctx.fillRect(join, y, 1.5, boardHeight);
    for (const nx of [join - 7, join + 7]) {
      for (const ny of [y + 11, y + boardHeight - 11]) {
        ctx.fillStyle = '#665e51'; ctx.beginPath(); ctx.arc(nx, ny, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (board % 3 === 1) {
      const kx = w * (.18 + random() * .6), ky = y + boardHeight * .5;
      for (let layer = 5; layer > 0; layer--) {
        ctx.strokeStyle = `rgba(72,46,26,${.08 + (6 - layer) * .025})`;
        ctx.lineWidth = .7; ctx.beginPath(); ctx.ellipse(kx, ky, layer * 7, layer * 1.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  speckle(ctx, w, h, random, 7500, .075);
}

function drawConcrete(ctx, w, h) {
  const random = seededRandom(293);
  ctx.fillStyle = '#babbb4'; ctx.fillRect(0, 0, w, h);
  // Soft trowel clouds and aggregate; no cracks that could imply structural damage.
  for (let i = 0; i < 28; i++) {
    const x = random() * w, y = random() * h, radius = 18 + random() * 85;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, i % 2 ? 'rgba(252,250,236,.09)' : 'rgba(77,81,75,.065)');
    cloud.addColorStop(1, 'rgba(140,142,134,0)');
    ctx.fillStyle = cloud; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  speckle(ctx, w, h, random, 26000, .12, 1.5);
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = 'rgba(60,64,59,.14)'; ctx.beginPath();
    ctx.arc(random() * w, random() * h, .4 + random() * .7, 0, Math.PI * 2); ctx.fill();
  }
}

function drawStone(ctx, w, h) {
  const random = seededRandom(470);
  ctx.fillStyle = '#827e70'; ctx.fillRect(0, 0, w, h);
  const rowHeight = h / 4;
  for (let row = 0; row < 4; row++) {
    const stoneWidth = w / 3, offset = row % 2 ? -stoneWidth / 2 : 0;
    for (let col = -1; col < 4; col++) {
      const x = offset + col * stoneWidth, y = row * rowHeight;
      const shade = 168 + Math.floor(random() * 36);
      ctx.fillStyle = `rgb(${shade + 10},${shade + 5},${shade - 9})`;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 4);
      ctx.lineTo(x + stoneWidth * .49, y + 3 + random() * 3);
      ctx.lineTo(x + stoneWidth - 9, y + 4); ctx.lineTo(x + stoneWidth - 4, y + 10);
      ctx.lineTo(x + stoneWidth - 5 - random() * 2, y + rowHeight * .52);
      ctx.lineTo(x + stoneWidth - 5, y + rowHeight - 11); ctx.lineTo(x + stoneWidth - 11, y + rowHeight - 5);
      ctx.lineTo(x + stoneWidth * .44, y + rowHeight - 4 - random() * 3);
      ctx.lineTo(x + 9, y + rowHeight - 5); ctx.lineTo(x + 4, y + rowHeight - 11);
      ctx.lineTo(x + 4 + random() * 2, y + 11); ctx.closePath(); ctx.fill();
      for (let patch = 0; patch < 18; patch++) {
        ctx.fillStyle = `rgba(105,104,86,${.018 + random() * .035})`;
        ctx.beginPath(); ctx.ellipse(x + 18 + random() * (stoneWidth - 36), y + 18 + random() * (rowHeight - 36), 4 + random() * 13, 2 + random() * 7, random(), 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(244,237,215,.27)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 12, y + 6); ctx.lineTo(x + stoneWidth - 12, y + 6); ctx.stroke();
      for (let vein = 0; vein < 6; vein++) {
        const gy = y + 12 + random() * (rowHeight - 24);
        ctx.strokeStyle = `rgba(95,94,77,${.04 + random() * .10})`; ctx.lineWidth = .7 + random() * 2;
        ctx.beginPath(); ctx.moveTo(x + 10, gy);
        ctx.bezierCurveTo(x + stoneWidth * .4, gy + 7, x + stoneWidth * .7, gy - 9, x + stoneWidth - 10, gy + 2); ctx.stroke();
      }
    }
  }
  speckle(ctx, w, h, random, 19000, .14, 2);
}

function drawMetal(ctx, w, h) {
  const random = seededRandom(717);
  ctx.fillStyle = '#9fa9a5'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(222,232,227,${.03 + random() * .14})`;
    ctx.fillRect(random() * w, random() * h, 15 + random() * 60, .35 + random() * .45);
  }
  // Small oxide flecks leave broad satin-steel highlights readable on the steps.
  for (let i = 0; i < 36; i++) {
    const x = random() * w, y = random() * h, radius = 1 + random() * 6;
    ctx.fillStyle = i % 2 ? '#876248' : '#986e4d';
    ctx.beginPath();
    for (let edge = 0; edge < 12; edge++) {
      const angle = edge / 12 * Math.PI * 2, r = radius * (.5 + random() * .6);
      const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r * .6;
      if (edge) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    for (let fleck = 0; fleck < 8; fleck++) {
      ctx.fillStyle = fleck % 2 ? 'rgba(101,71,48,.5)' : 'rgba(173,126,81,.5)';
      ctx.fillRect(x + (random() - .5) * radius * 2, y + (random() - .5) * radius, .6 + random(), .6 + random());
    }
  }
  speckle(ctx, w, h, random, 3500, .08, 1.2);
}

function drawRoof(ctx, w, h) {
  const random = seededRandom(168);
  ctx.fillStyle = '#715c48'; ctx.fillRect(0, 0, w, h);
  const tileW = w / 8, tileH = h / 4;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
    const x = col * tileW, y = row * tileH, variation = random() * 12;
    const curve = ctx.createLinearGradient(x, 0, x + tileW, 0);
    curve.addColorStop(0, '#836149'); curve.addColorStop(.48, `rgb(${153 + variation},${118 + variation},${84 + variation})`); curve.addColorStop(1, '#6f5440');
    ctx.fillStyle = curve; ctx.fillRect(x + 1, y + 1, tileW - 2, tileH - 3);
    ctx.fillStyle = 'rgba(57,40,30,.45)'; ctx.fillRect(x, y + tileH - 4, tileW, 3);
    ctx.fillStyle = 'rgba(229,195,149,.21)'; ctx.fillRect(x + 4, y + 2, tileW - 8, 2);
  }
  speckle(ctx, w, h, random, 19000, .12, 1.5);
}

function drawSidewall(ctx, w, h) {
  const random = seededRandom(405);
  ctx.fillStyle = '#c9cccc'; ctx.fillRect(0, 0, w, h);
  // Moulding rings follow the lathe's profile UVs. No fictional brand or size text.
  for (const v of [.145, .205, .25, .72, .775, .83]) {
    ctx.fillStyle = '#a0a5a6'; ctx.fillRect(0, h * v, w, 1.5);
    ctx.fillStyle = '#dce0df'; ctx.fillRect(0, h * v + 1.5, w, .8);
  }
  for (let x = 0; x < w; x += 16) {
    ctx.fillStyle = '#b2b8b7'; ctx.fillRect(x, h * .20, 1, h * .045); ctx.fillRect(x, h * .73, 1, h * .043);
  }
  speckle(ctx, w, h, random, 8000, .12, .9);
}

function drawTread(variant) {
  return (ctx, w, h) => {
    const random = seededRandom(821 + variant);
    ctx.fillStyle = '#c0c5c6'; ctx.fillRect(0, 0, w, h);
    const groove = (points, width = 4, color = '#464e50') => {
      ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineJoin = 'round';
      ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    };
    if (variant === 0) {
      for (const y of [h * .26, h * .50, h * .74]) groove([[0, y], [w, y]], 5);
      for (let x = -32; x < w + 32; x += 32) {
        groove([[x, 0], [x + 10, h * .26]], 4);
        groove([[x + 10, h * .74], [x, h]], 4);
        groove([[x + 10, h * .29], [x + 14, h * .48]], 1.5, '#7c8485');
      }
    } else if (variant === 1) {
      for (const y of [h * .28, h * .72]) groove([[0, y], [w, y]], 4);
      for (let x = -32; x < w + 32; x += 32) {
        groove([[x, 0], [x + 21, h * .5], [x, h]], 5);
        for (let s = 0; s < 3; s++) {
          const sx = x + s * 7;
          groove([[sx, h * .1], [sx + 5, h * .16], [sx + 2, h * .20], [sx + 8, h * .26]], 1.2, '#727a7b');
          groove([[sx + 8, h * .75], [sx + 2, h * .80], [sx + 5, h * .85], [sx, h * .92]], 1.2, '#727a7b');
        }
      }
    } else if (variant === 2) {
      groove([[0, h * .46], [w, h * .46]], 6);
      for (let x = -32; x < w + 32; x += 32) {
        groove([[x, 0], [x + 8, h * .25], [x + 24, h * .44]], 5);
        groove([[x + 24, h * .49], [x + 10, h * .78], [x, h]], 5);
        groove([[x + 10, h * .02], [x + 16, h * .24]], 1.4, '#899091');
      }
    } else {
      for (const y of [h * .31, h * .68]) groove([[0, y], [w, y]], 8);
      for (let x = -32; x < w + 32; x += 32) {
        groove([[x + 3, 0], [x + 12, h * .30]], 8);
        groove([[x + 24, h * .34], [x + 18, h * .66]], 7);
        groove([[x + 10, h * .70], [x + 2, h]], 8);
        groove([[x + 9, h * .48], [x + 22, h * .48]], 1.5, '#808888');
      }
    }
    speckle(ctx, w, h, random, 4700, .10, .9);
  };
}

export function createMaterialTextures() {
  return {
    wood: surface(512, 512, drawWood, { roughness: [.72, .97] }),
    concrete: surface(512, 512, drawConcrete, { roughness: [.83, 1] }),
    stone: surface(512, 512, drawStone, { roughness: [.86, 1] }),
    metal: surface(256, 256, drawMetal, { roughness: [.25, .46], metallic: true }),
    roof: surface(512, 512, drawRoof, { roughness: [.85, 1] }),
    rubber: surface(512, 256, drawSidewall, { roughness: [.85, 1] }),
    treads: TYRE_VARIANTS.map((_, index) => surface(512, 128, drawTread(index), { roughness: [.84, 1] })),
  };
}
