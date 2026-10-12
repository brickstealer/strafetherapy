import * as THREE from 'three';

// Simple deterministic pseudo-random number generator for reproducible procedural details
function createPRNG(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface CastleFloorTextures {
  diffuse: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

// Generate seamless 1024x1024 medieval castle stone flagstone textures (Diffuse, Normal, Roughness)
export function generateCastleFloorTextures(): CastleFloorTextures {
  const size = 1024;
  const rand = createPRNG(1337);

  // 1. Layout specification: 4 rows of varied interlocking castle flagstones
  // All horizontal and vertical seam boundaries exactly align at 0 and size (1024) for 100% seamless tiling
  interface StoneDef {
    x: number;
    y: number;
    w: number;
    h: number;
    seed: number;
    colorVariant: number;
    hasCracks: boolean;
    chipCorners: boolean[];
  }

  const stones: StoneDef[] = [];

  // Row 0: y in [0, 256] -> widths: 288, 224, 256, 256 (sum = 1024)
  const r0W = [288, 224, 256, 256];
  let curX = 0;
  for (let i = 0; i < r0W.length; i++) {
    stones.push({
      x: curX,
      y: 0,
      w: r0W[i],
      h: 256,
      seed: 100 + i,
      colorVariant: i % 5,
      hasCracks: i % 2 === 0,
      chipCorners: [rand() > 0.5, rand() > 0.6, rand() > 0.7, rand() > 0.5]
    });
    curX += r0W[i];
  }

  // Row 1: y in [256, 512] -> widths: 160, 320, 256, 288 (sum = 1024)
  const r1W = [160, 320, 256, 288];
  curX = 0;
  for (let i = 0; i < r1W.length; i++) {
    stones.push({
      x: curX,
      y: 256,
      w: r1W[i],
      h: 256,
      seed: 200 + i,
      colorVariant: (i + 2) % 5,
      hasCracks: i === 1 || i === 3,
      chipCorners: [rand() > 0.6, rand() > 0.5, rand() > 0.5, rand() > 0.7]
    });
    curX += r1W[i];
  }

  // Row 2: y in [512, 768] -> mixed large & split stones
  // Stone 0: 256 x 256
  stones.push({
    x: 0, y: 512, w: 256, h: 256,
    seed: 300, colorVariant: 3, hasCracks: true,
    chipCorners: [true, false, true, false]
  });
  // Stones 1a & 1b: 224 x 128 (split horizontally)
  stones.push({
    x: 256, y: 512, w: 224, h: 128,
    seed: 310, colorVariant: 1, hasCracks: false,
    chipCorners: [false, true, false, false]
  });
  stones.push({
    x: 256, y: 640, w: 224, h: 128,
    seed: 311, colorVariant: 4, hasCracks: true,
    chipCorners: [false, false, true, true]
  });
  // Stone 2: 288 x 256
  stones.push({
    x: 480, y: 512, w: 288, h: 256,
    seed: 320, colorVariant: 0, hasCracks: true,
    chipCorners: [true, true, false, false]
  });
  // Stones 3a & 3b: 256 x 128
  stones.push({
    x: 768, y: 512, w: 256, h: 128,
    seed: 330, colorVariant: 2, hasCracks: false,
    chipCorners: [false, false, true, false]
  });
  stones.push({
    x: 768, y: 640, w: 256, h: 128,
    seed: 331, colorVariant: 1, hasCracks: true,
    chipCorners: [true, false, false, true]
  });

  // Row 3: y in [768, 1024] -> widths: 224, 256, 320, 224 (sum = 1024)
  const r3W = [224, 256, 320, 224];
  curX = 0;
  for (let i = 0; i < r3W.length; i++) {
    stones.push({
      x: curX,
      y: 768,
      w: r3W[i],
      h: 256,
      seed: 400 + i,
      colorVariant: (i + 4) % 5,
      hasCracks: i === 0 || i === 2,
      chipCorners: [rand() > 0.5, rand() > 0.7, rand() > 0.6, rand() > 0.5]
    });
    curX += r3W[i];
  }

  // 2. Pre-generate procedural heightmap (1024x1024)
  const heightmap = new Float32Array(size * size);
  // Default mortar height
  heightmap.fill(0.08);

  // Mortar gap width (in pixels)
  const mortarMargin = 5; // 5px margin per stone -> 10px mortar groove between stones
  const bevelWidth = 14;   // 14px bevel slope on stone edges

  // Castle stone color palettes [R, G, B]
  const palettes = [
    [46, 52, 64],  // Slate Granite
    [38, 43, 53],  // Deep Basalt
    [52, 48, 43],  // Weathered Castle Ashlar (warm undertone)
    [42, 48, 58],  // Gothic Blue-Gray Slate
    [48, 50, 56]   // Ancient Flagstone
  ];

  // Canvas for Diffuse Texture
  const diffuseCanvas = document.createElement('canvas');
  diffuseCanvas.width = size;
  diffuseCanvas.height = size;
  const ctx = diffuseCanvas.getContext('2d')!;

  // Fill canvas with deep mortar base
  ctx.fillStyle = '#0f1218';
  ctx.fillRect(0, 0, size, size);

  // Mortar texture: grainy aged cement / lime sand
  const mortarImgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const grain = (rand() - 0.5) * 16;
    const baseR = 16 + grain;
    const baseG = 19 + grain;
    const baseB = 25 + grain;
    mortarImgData.data[i * 4] = Math.max(10, Math.min(35, baseR));
    mortarImgData.data[i * 4 + 1] = Math.max(12, Math.min(38, baseG));
    mortarImgData.data[i * 4 + 2] = Math.max(16, Math.min(48, baseB));
    mortarImgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(mortarImgData, 0, 0);

  // 3. Render each stone into heightmap & diffuse canvas
  stones.forEach((st) => {
    const sRand = createPRNG(st.seed);
    const pal = palettes[st.colorVariant];
    const rBase = pal[0];
    const gBase = pal[1];
    const bBase = pal[2];

    const innerX0 = st.x + mortarMargin;
    const innerY0 = st.y + mortarMargin;
    const innerX1 = st.x + st.w - mortarMargin;
    const innerY1 = st.y + st.h - mortarMargin;
    const innerW = innerX1 - innerX0;
    const innerH = innerY1 - innerY0;

    // Corner chip dimensions
    const chipRadii = [
      st.chipCorners[0] ? 12 + sRand() * 8 : 0, // top-left
      st.chipCorners[1] ? 12 + sRand() * 8 : 0, // top-right
      st.chipCorners[2] ? 12 + sRand() * 8 : 0, // bottom-right
      st.chipCorners[3] ? 12 + sRand() * 8 : 0  // bottom-left
    ];

    // Pre-calculate crack path if stone has cracks
    const crackPoints: { x: number; y: number }[] = [];
    if (st.hasCracks) {
      const startEdge = Math.floor(sRand() * 4);
      let cx = startEdge === 0 ? innerX0 + sRand() * innerW :
               startEdge === 1 ? innerX1 :
               startEdge === 2 ? innerX0 + sRand() * innerW : innerX0;
      let cy = startEdge === 0 ? innerY0 :
               startEdge === 1 ? innerY0 + sRand() * innerH :
               startEdge === 2 ? innerY1 : innerY0 + sRand() * innerH;

      crackPoints.push({ x: cx, y: cy });
      const steps = 6 + Math.floor(sRand() * 6);
      const targetX = innerX0 + innerW * (0.3 + sRand() * 0.4);
      const targetY = innerY0 + innerH * (0.3 + sRand() * 0.4);

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        cx = cx * (1 - t) + targetX * t + (sRand() - 0.5) * 16;
        cy = cy * (1 - t) + targetY * t + (sRand() - 0.5) * 16;
        crackPoints.push({ x: cx, y: cy });
      }
    }

    // Rasterize stone pixels
    for (let py = innerY0; py < innerY1; py++) {
      const dyTop = py - innerY0;
      const dyBottom = innerY1 - 1 - py;
      const distY = Math.min(dyTop, dyBottom);

      for (let px = innerX0; px < innerX1; px++) {
        const dxLeft = px - innerX0;
        const dxRight = innerX1 - 1 - px;
        const distX = Math.min(dxLeft, dxRight);

        // Distance to stone perimeter
        let distToEdge = Math.min(distX, distY);

        // Check corner chips
        let isChipped = false;
        if (dxLeft < chipRadii[0] && dyTop < chipRadii[0]) {
          const cornerDist = Math.hypot(chipRadii[0] - dxLeft, chipRadii[0] - dyTop);
          if (cornerDist > chipRadii[0]) isChipped = true;
        } else if (dxRight < chipRadii[1] && dyTop < chipRadii[1]) {
          const cornerDist = Math.hypot(chipRadii[1] - dxRight, chipRadii[1] - dyTop);
          if (cornerDist > chipRadii[1]) isChipped = true;
        } else if (dxRight < chipRadii[2] && dyBottom < chipRadii[2]) {
          const cornerDist = Math.hypot(chipRadii[2] - dxRight, chipRadii[2] - dyBottom);
          if (cornerDist > chipRadii[2]) isChipped = true;
        } else if (dxLeft < chipRadii[3] && dyBottom < chipRadii[3]) {
          const cornerDist = Math.hypot(chipRadii[3] - dxLeft, chipRadii[3] - dyBottom);
          if (cornerDist > chipRadii[3]) isChipped = true;
        }

        const mapIdx = py * size + px;

        if (isChipped) {
          heightmap[mapIdx] = 0.22 + sRand() * 0.08;
          continue;
        }

        // Height slope (bevel)
        let h = 0.08;
        if (distToEdge < bevelWidth) {
          const t = distToEdge / bevelWidth;
          // Smooth convex curve
          h = 0.08 + (0.86 - 0.08) * Math.sin(t * Math.PI * 0.5);
        } else {
          // Subtle domed stone plateau
          const relCenterX = (px - (innerX0 + innerW * 0.5)) / (innerW * 0.5);
          const relCenterY = (py - (innerY0 + innerH * 0.5)) / (innerH * 0.5);
          const dome = 1.0 - (relCenterX * relCenterX + relCenterY * relCenterY) * 0.12;
          h = 0.86 * dome;
        }

        // Stone grain noise
        const grainVal = (sRand() - 0.5) * 0.04;
        h += grainVal;

        // Check cracks
        let crackDist = 999;
        if (crackPoints.length > 1) {
          for (let k = 0; k < crackPoints.length - 1; k++) {
            const p1 = crackPoints[k];
            const p2 = crackPoints[k + 1];
            // Segment distance
            const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
            let t = ((px - p1.x) * (p2.x - p1.x) + (py - p1.y) * (p2.y - p1.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = p1.x + t * (p2.x - p1.x);
            const projY = p1.y + t * (p2.y - p1.y);
            const d = Math.hypot(px - projX, py - projY);
            if (d < crackDist) crackDist = d;
          }
        }

        if (crackDist < 1.6) {
          h = Math.min(h, 0.25);
        } else if (crackDist < 3.2) {
          h += 0.03; // Light ridge highlight along crack edge
        }

        heightmap[mapIdx] = Math.max(0.05, Math.min(1.0, h));
      }
    }

    // Draw Stone on Diffuse Canvas
    ctx.save();
    // Base stone polygon with rounded & chipped edges
    ctx.beginPath();
    ctx.rect(innerX0, innerY0, innerW, innerH);
    ctx.closePath();

    // Create bevel gradient for stone illumination
    const grad = ctx.createRadialGradient(
      innerX0 + innerW * 0.45, innerY0 + innerH * 0.45, 10,
      innerX0 + innerW * 0.5, innerY0 + innerH * 0.5, Math.max(innerW, innerH) * 0.65
    );
    // Center is slightly brighter and richer
    grad.addColorStop(0, `rgb(${Math.min(255, rBase + 12)}, ${Math.min(255, gBase + 12)}, ${Math.min(255, bBase + 14)})`);
    grad.addColorStop(0.7, `rgb(${rBase}, ${gBase}, ${bBase})`);
    grad.addColorStop(1, `rgb(${Math.max(10, rBase - 16)}, ${Math.max(10, gBase - 16)}, ${Math.max(10, bBase - 14)})`);

    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Chiseled texture lines (medieval stone cutter toolmarks)
    ctx.strokeStyle = `rgba(255, 255, 255, 0.035)`;
    ctx.lineWidth = 1;
    const chiselAngle = (sRand() - 0.5) * 0.4;
    for (let c = 0; c < innerH; c += 16 + Math.floor(sRand() * 12)) {
      ctx.beginPath();
      ctx.moveTo(innerX0 + 4, innerY0 + c);
      ctx.lineTo(innerX1 - 4, innerY0 + c + Math.tan(chiselAngle) * innerW);
      ctx.stroke();
    }

    // Draw corner chips on diffuse
    for (let ci = 0; ci < 4; ci++) {
      if (st.chipCorners[ci]) {
        const rad = chipRadii[ci];
        const cornerX = (ci === 0 || ci === 3) ? innerX0 : innerX1;
        const cornerY = (ci === 0 || ci === 1) ? innerY0 : innerY1;

        ctx.fillStyle = '#141720';
        ctx.beginPath();
        ctx.arc(cornerX, cornerY, rad, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw stone cracks
    if (st.hasCracks && crackPoints.length > 1) {
      // Dark crack fissure
      ctx.strokeStyle = '#090b0f';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(crackPoints[0].x, crackPoints[0].y);
      for (let k = 1; k < crackPoints.length; k++) {
        ctx.lineTo(crackPoints[k].x, crackPoints[k].y);
      }
      ctx.stroke();

      // Parallel highlighted edge of fracture
      ctx.strokeStyle = 'rgba(180, 195, 220, 0.18)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(crackPoints[0].x + 1, crackPoints[0].y - 1);
      for (let k = 1; k < crackPoints.length; k++) {
        ctx.lineTo(crackPoints[k].x + 1, crackPoints[k].y - 1);
      }
      ctx.stroke();
    }

    // Subtle edge highlight on top and left bevel
    ctx.strokeStyle = `rgba(255, 255, 255, 0.06)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(innerX0 + 2, innerY1 - 2);
    ctx.lineTo(innerX0 + 2, innerY0 + 2);
    ctx.lineTo(innerX1 - 2, innerY0 + 2);
    ctx.stroke();

    // Subtle shadow on bottom and right bevel
    ctx.strokeStyle = `rgba(0, 0, 0, 0.45)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(innerX1 - 2, innerY0 + 2);
    ctx.lineTo(innerX1 - 2, innerY1 - 2);
    ctx.lineTo(innerX0 + 2, innerY1 - 2);
    ctx.stroke();

    ctx.restore();
  });

  // 4. Generate Tangent Space Normal Map Canvas from Heightmap (Sobel Filter with Seamless Wrapping)
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const ctxNorm = normalCanvas.getContext('2d')!;
  const normImgData = ctxNorm.createImageData(size, size);

  const normalStrength = 7.0; // Rich tactile stone relief

  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;

    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;

      // 3x3 Sobel neighborhood
      const tl = heightmap[yPrev * size + xPrev];
      const t  = heightmap[yPrev * size + x];
      const tr = heightmap[yPrev * size + xNext];
      const l  = heightmap[y * size + xPrev];
      const r  = heightmap[y * size + xNext];
      const bl = heightmap[yNext * size + xPrev];
      const b  = heightmap[yNext * size + x];
      const br = heightmap[yNext * size + xNext];

      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

      const nx = -dX * normalStrength;
      const ny = -dY * normalStrength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      const pIdx = (y * size + x) * 4;
      normImgData.data[pIdx]     = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
      normImgData.data[pIdx + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
      normImgData.data[pIdx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
      normImgData.data[pIdx + 3] = 255;
    }
  }
  ctxNorm.putImageData(normImgData, 0, 0);

  // 5. Generate Roughness Map Canvas
  // Polished stone plateaus reflect torches with soft specular gloss; mortar grooves are matte
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const ctxRough = roughCanvas.getContext('2d')!;
  const roughImgData = ctxRough.createImageData(size, size);

  for (let i = 0; i < size * size; i++) {
    const h = heightmap[i];
    let roughVal: number;

    if (h < 0.25) {
      // Mortar groove / deep crack -> very matte
      roughVal = 245;
    } else if (h < 0.7) {
      // Slanted stone bevel
      roughVal = 180 + Math.floor((rand() - 0.5) * 15);
    } else {
      // Worn foot-trodden stone surface -> semi-polished sheen
      roughVal = 135 + Math.floor((rand() - 0.5) * 25);
    }

    const pIdx = i * 4;
    roughImgData.data[pIdx]     = roughVal;
    roughImgData.data[pIdx + 1] = roughVal;
    roughImgData.data[pIdx + 2] = roughVal;
    roughImgData.data[pIdx + 3] = 255;
  }
  ctxRough.putImageData(roughImgData, 0, 0);

  // 6. Wrap in Three.js CanvasTextures with 16x Anisotropy & Repeat Wrapping
  const diffTex = new THREE.CanvasTexture(diffuseCanvas);
  diffTex.wrapS = THREE.RepeatWrapping;
  diffTex.wrapT = THREE.RepeatWrapping;
  diffTex.anisotropy = 16;

  const normTex = new THREE.CanvasTexture(normalCanvas);
  normTex.wrapS = THREE.RepeatWrapping;
  normTex.wrapT = THREE.RepeatWrapping;
  normTex.anisotropy = 16;

  const roughTex = new THREE.CanvasTexture(roughCanvas);
  roughTex.wrapS = THREE.RepeatWrapping;
  roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.anisotropy = 16;

  return {
    diffuse: diffTex,
    normal: normTex,
    roughness: roughTex
  };
}

// Generate an ornate central Gothic Rose / Castle Crest Medallion inlaid into the stone floor
export function createCastleRosetteGroup(radius: number = 150): THREE.Group {
  const group = new THREE.Group();

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const cx = 512;
  const cy = 512;

  // Background deep black marble
  ctx.fillStyle = '#12141a';
  ctx.beginPath();
  ctx.arc(cx, cy, 510, 0, Math.PI * 2);
  ctx.fill();

  // Outer Chiseled Stone Border
  ctx.strokeStyle = '#282d38';
  ctx.lineWidth = 24;
  ctx.stroke();

  // Embossed Brass Outer Ring
  ctx.strokeStyle = '#b8862d';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, 480, 0, Math.PI * 2);
  ctx.stroke();

  // Rivets / Studs around outer brass ring
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
    const rx = cx + Math.cos(a) * 480;
    const ry = cy + Math.sin(a) * 480;
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(rx, ry, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(rx + 1, ry + 1, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark polished Obsidian Inner Ring
  ctx.fillStyle = '#181b22';
  ctx.beginPath();
  ctx.arc(cx, cy, 450, 0, Math.PI * 2);
  ctx.fill();

  // Ornate Inscribed Concentric Gothic Circles
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 410, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 380, 0, Math.PI * 2);
  ctx.stroke();

  // 16-point Castle Compass Rose (Eight primary, eight secondary rays)
  const numRays = 16;
  for (let i = 0; i < numRays; i++) {
    const angle = (i * Math.PI * 2) / numRays;
    const isPrimary = i % 2 === 0;
    const rayLen = isPrimary ? 370 : 250;
    const halfWidthAngle = Math.PI / numRays;

    const tipX = cx + Math.cos(angle) * rayLen;
    const tipY = cy + Math.sin(angle) * rayLen;
    const leftX = cx + Math.cos(angle - halfWidthAngle) * 85;
    const leftY = cy + Math.sin(angle - halfWidthAngle) * 85;
    const rightX = cx + Math.cos(angle + halfWidthAngle) * 85;
    const rightY = cy + Math.sin(angle + halfWidthAngle) * 85;

    // Left half (illuminated gold/brass or polished white marble)
    ctx.fillStyle = isPrimary ? '#d97706' : '#92400e';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fill();

    // Right half (shadowed antique bronze or dark granite)
    ctx.fillStyle = isPrimary ? '#78350f' : '#451a03';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(rightX, rightY);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fill();

    // Ray dividing bevel line
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = isPrimary ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }

  // Central Gothic Quatrefoil Medallion
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx, cy, 110, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 8;
  ctx.stroke();

  // Center Shield & Gothic Cross
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(cx, cy, 75, 0, Math.PI * 2);
  ctx.fill();

  // Golden Knight Cross
  ctx.fillStyle = '#fef08a';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 15;
  // Vertical beam
  ctx.fillRect(cx - 10, cy - 60, 20, 120);
  // Horizontal beam
  ctx.fillRect(cx - 50, cy - 25, 100, 20);
  ctx.shadowBlur = 0;

  // Center glowing sapphire jewel
  const gemGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 18);
  gemGrad.addColorStop(0, '#67e8f9');
  gemGrad.addColorStop(0.5, '#06b6d4');
  gemGrad.addColorStop(1, '#0e7490');
  ctx.fillStyle = gemGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fill();

  // Create texture and standard material
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.4,
    metalness: 0.55
  });

  const geo = new THREE.CircleGeometry(radius, 64);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.08, 0); // Sits right above floor to prevent z-fighting
  mesh.receiveShadow = true;
  group.add(mesh);

  return group;
}

