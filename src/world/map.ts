import * as THREE from 'three';
import type { CollisionWorld } from '../physics/pmove';

export interface Torch {
  light?: THREE.PointLight;
  flameMesh: THREE.Mesh;
  baseIntensity: number;
  flickerSpeed: number;
  seed: number;
}

export class WorldMap {
  public scene: THREE.Scene;
  public collisionWorld: CollisionWorld;
  public spawnPoint: THREE.Vector3;
  public spawnYaw: number;
  public torches: Torch[] = [];

  // Reusable materials & textures
  private materials: { [key: string]: THREE.Material } = {};
  private textures: { [key: string]: THREE.Texture } = {};
  private paintingsTextures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.collisionWorld = {
      boxes: [],
      ramps: [],
      triggers: []
    };
    this.spawnPoint = new THREE.Vector3(0, 0, 0);
    this.spawnYaw = 0; // Looking towards -Z

    this.initTexturesAndMaterials();
    this.buildLevelGeometry();
  }

  // Create retro cyber Defrag & Gothic Castle textures
  private initTexturesAndMaterials(): void {
    // 1. Dark Grid Floor (Defrag standard)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const ctxF = floorCanvas.getContext('2d')!;

    ctxF.fillStyle = '#0a0d14';
    ctxF.fillRect(0, 0, 512, 512);

    ctxF.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctxF.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctxF.beginPath(); ctxF.moveTo(i, 0); ctxF.lineTo(i, 512); ctxF.stroke();
      ctxF.beginPath(); ctxF.moveTo(0, i); ctxF.lineTo(512, i); ctxF.stroke();
    }

    ctxF.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctxF.lineWidth = 4;
    for (let i = 0; i <= 512; i += 256) {
      ctxF.beginPath(); ctxF.moveTo(i, 0); ctxF.lineTo(i, 512); ctxF.stroke();
      ctxF.beginPath(); ctxF.moveTo(0, i); ctxF.lineTo(512, i); ctxF.stroke();
    }

    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    this.textures['floor'] = floorTex;

    // 2. Gothic Stone Brick Wall Texture (For Corridors)
    const stoneCanvas = document.createElement('canvas');
    stoneCanvas.width = 512;
    stoneCanvas.height = 512;
    const ctxS = stoneCanvas.getContext('2d')!;

    ctxS.fillStyle = '#171923';
    ctxS.fillRect(0, 0, 512, 512);

    // Stone brick rows
    const rowH = 64;
    for (let y = 0; y < 512; y += rowH) {
      const isOffset = (y / rowH) % 2 === 1;
      const brickW = 128;
      const startX = isOffset ? -64 : 0;

      for (let x = startX; x < 512 + 64; x += brickW) {
        // Brick background
        ctxS.fillStyle = Math.random() > 0.5 ? '#1f2430' : '#1a1f2c';
        ctxS.fillRect(x + 2, y + 2, brickW - 4, rowH - 4);

        // Mortar lines
        ctxS.strokeStyle = '#0d0f14';
        ctxS.lineWidth = 3;
        ctxS.strokeRect(x, y, brickW, rowH);

        // Weathering cracks & moss details
        ctxS.strokeStyle = 'rgba(255, 120, 40, 0.08)';
        ctxS.beginPath();
        ctxS.moveTo(x + 10, y + 20);
        ctxS.lineTo(x + 40, y + 25);
        ctxS.stroke();
      }
    }

    // Top & Bottom neon accent borders on stone
    ctxS.fillStyle = '#f97316';
    ctxS.fillRect(0, 0, 512, 6);
    ctxS.fillStyle = '#38bdf8';
    ctxS.fillRect(0, 506, 512, 6);

    const stoneTex = new THREE.CanvasTexture(stoneCanvas);
    stoneTex.wrapS = THREE.RepeatWrapping;
    stoneTex.wrapT = THREE.RepeatWrapping;
    this.textures['stoneWall'] = stoneTex;

    // 3. Wall Dev-Texture with orange trim
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const ctxW = wallCanvas.getContext('2d')!;
    ctxW.fillStyle = '#111827';
    ctxW.fillRect(0, 0, 512, 512);
    ctxW.fillStyle = '#0f172a';
    ctxW.fillRect(16, 16, 480, 480);
    ctxW.strokeStyle = '#f97316';
    ctxW.lineWidth = 6;
    ctxW.strokeRect(8, 8, 496, 496);
    const wallTex = new THREE.CanvasTexture(wallCanvas);
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    this.textures['wall'] = wallTex;

    // 4. Launchpad Glow Grid
    const padCanvas = document.createElement('canvas');
    padCanvas.width = 256;
    padCanvas.height = 256;
    const ctxP = padCanvas.getContext('2d')!;
    ctxP.fillStyle = '#050505';
    ctxP.fillRect(0, 0, 256, 256);
    ctxP.strokeStyle = '#00f0ff';
    ctxP.lineWidth = 8;
    for (let y = 60; y <= 200; y += 45) {
      ctxP.beginPath();
      ctxP.moveTo(60, y + 20);
      ctxP.lineTo(128, y - 20);
      ctxP.lineTo(196, y + 20);
      ctxP.stroke();
    }
    const padTex = new THREE.CanvasTexture(padCanvas);
    this.textures['pad'] = padTex;

    // 5. Hazard Void Grid
    const hazardCanvas = document.createElement('canvas');
    hazardCanvas.width = 256;
    hazardCanvas.height = 256;
    const ctxH = hazardCanvas.getContext('2d')!;
    ctxH.fillStyle = '#1a0515';
    ctxH.fillRect(0, 0, 256, 256);
    ctxH.strokeStyle = '#ff0055';
    ctxH.lineWidth = 4;
    for (let i = 0; i <= 256; i += 32) {
      ctxH.beginPath(); ctxH.moveTo(i, 0); ctxH.lineTo(i, 256); ctxH.stroke();
      ctxH.beginPath(); ctxH.moveTo(0, i); ctxH.lineTo(256, i); ctxH.stroke();
    }
    const hazardTex = new THREE.CanvasTexture(hazardCanvas);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.wrapT = THREE.RepeatWrapping;
    this.textures['hazard'] = hazardTex;

    // 6. Generate 5 Procedural Paintings (Medieval Gothic & Speed Legends)
    this.generatePaintings();

    // Materials
    this.materials['floor'] = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.7,
      metalness: 0.2
    });

    this.materials['stoneWall'] = new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.8,
      metalness: 0.15
    });

    this.materials['wall'] = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.6,
      metalness: 0.3
    });

    this.materials['pillar'] = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.6
    });

    this.materials['goldFrame'] = new THREE.MeshStandardMaterial({
      color: 0xc8963e,
      roughness: 0.3,
      metalness: 0.8
    });

    this.materials['ironTorch'] = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      roughness: 0.4,
      metalness: 0.9
    });

    this.materials['woodTorch'] = new THREE.MeshStandardMaterial({
      color: 0x5a3418,
      roughness: 0.8,
      metalness: 0.1
    });

    this.materials['fire'] = new THREE.MeshBasicMaterial({
      color: 0xff7700
    });

    this.materials['neonCyan'] = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.materials['neonOrange'] = new THREE.MeshBasicMaterial({ color: 0xff6600 });

    this.materials['launchpad'] = new THREE.MeshStandardMaterial({
      map: padTex,
      emissive: new THREE.Color(0x00ffcc),
      emissiveIntensity: 0.9,
      roughness: 0.3
    });

    this.materials['hazard'] = new THREE.MeshBasicMaterial({
      map: hazardTex,
      transparent: true,
      opacity: 0.85
    });

    this.materials['ramp'] = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.5,
      metalness: 0.2
    });
  }

  // Generate 5 distinct oil paintings with procedural canvas art
  private generatePaintings(): void {
    const titles = [
      'The Blood Moon Citadel',
      'Knight of Quake',
      'Tormented Rune Portal',
      'Skulls of the Damned',
      'Champion of Defrag'
    ];

    titles.forEach((_, idx) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 768;
      const ctx = c.getContext('2d')!;

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 768);
      if (idx === 0) {
        grad.addColorStop(0, '#2b0c15');
        grad.addColorStop(0.5, '#4a1525');
        grad.addColorStop(1, '#0c0508');
      } else if (idx === 1) {
        grad.addColorStop(0, '#0c1b2e');
        grad.addColorStop(0.5, '#1e3a5f');
        grad.addColorStop(1, '#050a12');
      } else if (idx === 2) {
        grad.addColorStop(0, '#1c0c2e');
        grad.addColorStop(0.5, '#3b185f');
        grad.addColorStop(1, '#080312');
      } else if (idx === 3) {
        grad.addColorStop(0, '#2e190c');
        grad.addColorStop(0.5, '#5f2c18');
        grad.addColorStop(1, '#120803');
      } else {
        grad.addColorStop(0, '#082b20');
        grad.addColorStop(0.5, '#155f48');
        grad.addColorStop(1, '#03120c');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 768);

      // Painting art details
      if (idx === 0) {
        // Red Blood Moon
        ctx.fillStyle = '#ff2244';
        ctx.beginPath();
        ctx.arc(256, 260, 110, 0, Math.PI * 2);
        ctx.fill();

        // Dark gothic castle spires silhouette
        ctx.fillStyle = '#060305';
        ctx.beginPath();
        ctx.moveTo(80, 768);
        ctx.lineTo(80, 420);
        ctx.lineTo(130, 300);
        ctx.lineTo(180, 420);
        ctx.lineTo(230, 450);
        ctx.lineTo(256, 180); // Tall central spire
        ctx.lineTo(282, 450);
        ctx.lineTo(330, 420);
        ctx.lineTo(380, 310);
        ctx.lineTo(430, 430);
        ctx.lineTo(430, 768);
        ctx.closePath();
        ctx.fill();
      } else if (idx === 1) {
        // Knight helmet silhouette with glowing cyan eye slit
        ctx.fillStyle = '#0a101d';
        ctx.beginPath();
        ctx.arc(256, 320, 130, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(150, 320, 212, 280);

        // Glowing visor
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 20;
        ctx.fillRect(190, 310, 132, 18);
        ctx.shadowBlur = 0;
      } else if (idx === 2) {
        // Rune portal circle
        ctx.strokeStyle = '#d946ef';
        ctx.lineWidth = 14;
        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(256, 384, 160, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(256, 384, 110, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (idx === 3) {
        // Golden Gothic Cross & Laurel
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 20;
        ctx.fillRect(236, 180, 40, 360);
        ctx.fillRect(156, 280, 200, 40);
        ctx.shadowBlur = 0;
      } else {
        // Cyber Defrag Winged Crest
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 10;
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(80, 300);
        ctx.lineTo(256, 460);
        ctx.lineTo(432, 300);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Ornate inner canvas border
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
      ctx.lineWidth = 12;
      ctx.strokeRect(20, 20, 472, 728);

      const tex = new THREE.CanvasTexture(c);
      this.paintingsTextures.push(tex);
    });
  }

  // Construct level geometry: One Giant Flat Arena with Floor, High Ceiling, Perimeter Walls, Torches & Paintings
  private buildLevelGeometry(): void {
    const halfSize = 1400; // 2800 x 2800 units wide open flat arena
    const wallH = 320;     // High 320u ceiling
    const thick = 30;

    // 1. COMPLETELY FLAT FLOOR at y = 0
    this.addBox(
      new THREE.Vector3(-halfSize, -20, -halfSize),
      new THREE.Vector3(halfSize, 0, halfSize),
      'floor',
      { repeatX: 28, repeatY: 28 }
    );

    // 2. FLAT CEILING at y = wallH
    this.addBox(
      new THREE.Vector3(-halfSize, wallH, -halfSize),
      new THREE.Vector3(halfSize, wallH + 20, halfSize),
      'stoneWall',
      { repeatX: 28, repeatY: 28 }
    );

    // 3. FOUR SOLID PERIMETER WALLS
    // North Wall (Z = -halfSize)
    this.addBox(
      new THREE.Vector3(-halfSize - thick, 0, -halfSize - thick),
      new THREE.Vector3(halfSize + thick, wallH, -halfSize),
      'stoneWall',
      { repeatX: 28, repeatY: 4 }
    );

    // South Wall (Z = +halfSize)
    this.addBox(
      new THREE.Vector3(-halfSize - thick, 0, halfSize),
      new THREE.Vector3(halfSize + thick, wallH, halfSize + thick),
      'stoneWall',
      { repeatX: 28, repeatY: 4 }
    );

    // West Wall (X = -halfSize)
    this.addBox(
      new THREE.Vector3(-halfSize - thick, 0, -halfSize),
      new THREE.Vector3(-halfSize, wallH, halfSize),
      'stoneWall',
      { repeatX: 28, repeatY: 4 }
    );

    // East Wall (X = +halfSize)
    this.addBox(
      new THREE.Vector3(halfSize, 0, -halfSize),
      new THREE.Vector3(halfSize + thick, wallH, halfSize),
      'stoneWall',
      { repeatX: 28, repeatY: 4 }
    );

    // 4. TORCHES & PAINTINGS LINING ALL FOUR WALLS
    const step = 140;
    let paintingIdx = 0;

    // North Wall (facing south, yaw = 0)
    for (let x = -halfSize + 140; x <= halfSize - 140; x += step) {
      const isTorch = (Math.abs(x) / step) % 2 === 0;
      if (isTorch) {
        const withLight = (Math.abs(x) / (step * 2)) % 2 === 0;
        this.addWallTorch(new THREE.Vector3(x, 60, -halfSize + 4), 0, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(x, 60, -halfSize + 4), 0, paintingIdx++);
      }
    }

    // South Wall (facing north, yaw = Math.PI)
    for (let x = -halfSize + 140; x <= halfSize - 140; x += step) {
      const isTorch = (Math.abs(x) / step) % 2 === 0;
      if (isTorch) {
        const withLight = (Math.abs(x) / (step * 2)) % 2 === 0;
        this.addWallTorch(new THREE.Vector3(x, 60, halfSize - 4), Math.PI, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(x, 60, halfSize - 4), Math.PI, paintingIdx++);
      }
    }

    // West Wall (facing east, yaw = Math.PI / 2)
    for (let z = -halfSize + 140; z <= halfSize - 140; z += step) {
      const isTorch = (Math.abs(z) / step) % 2 === 0;
      if (isTorch) {
        const withLight = (Math.abs(z) / (step * 2)) % 2 === 0;
        this.addWallTorch(new THREE.Vector3(-halfSize + 4, 60, z), Math.PI / 2, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(-halfSize + 4, 60, z), Math.PI / 2, paintingIdx++);
      }
    }

    // East Wall (facing west, yaw = -Math.PI / 2)
    for (let z = -halfSize + 140; z <= halfSize - 140; z += step) {
      const isTorch = (Math.abs(z) / step) % 2 === 0;
      if (isTorch) {
        const withLight = (Math.abs(z) / (step * 2)) % 2 === 0;
        this.addWallTorch(new THREE.Vector3(halfSize - 4, 60, z), -Math.PI / 2, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(halfSize - 4, 60, z), -Math.PI / 2, paintingIdx++);
      }
    }
  }

  // Add 3D Medieval Torch with animated flame & optional flickering PointLight
  public addWallTorch(pos: THREE.Vector3, yawAngle: number, withLight: boolean = true): void {
    const torchGroup = new THREE.Group();
    torchGroup.position.copy(pos);
    torchGroup.rotation.y = yawAngle;

    // 1. Metal wall mount bracket
    const bracketGeo = new THREE.BoxGeometry(4, 8, 8);
    const bracketMesh = new THREE.Mesh(bracketGeo, this.materials['ironTorch']);
    bracketMesh.position.set(0, 0, -4);
    torchGroup.add(bracketMesh);

    // 2. Angled torch wooden handle
    const handleGeo = new THREE.CylinderGeometry(1.5, 1.2, 18, 8);
    const handleMesh = new THREE.Mesh(handleGeo, this.materials['woodTorch']);
    handleMesh.rotation.x = Math.PI / 6;
    handleMesh.position.set(0, 4, 3);
    torchGroup.add(handleMesh);

    // 3. Iron bowl / cage
    const bowlGeo = new THREE.CylinderGeometry(3.5, 2.0, 5, 8);
    const bowlMesh = new THREE.Mesh(bowlGeo, this.materials['ironTorch']);
    bowlMesh.position.set(0, 11, 7);
    torchGroup.add(bowlMesh);

    // 4. Glowing 3D Flame Mesh
    const flameGeo = new THREE.ConeGeometry(2.8, 8, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const flameMesh = new THREE.Mesh(flameGeo, flameMat);
    flameMesh.position.set(0, 16, 7);
    torchGroup.add(flameMesh);

    // Inner bright core
    const coreGeo = new THREE.ConeGeometry(1.5, 5, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0aa });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 15, 7);
    torchGroup.add(coreMesh);

    // 5. Optional Flickering Torch PointLight
    let torchLight: THREE.PointLight | undefined;
    if (withLight) {
      torchLight = new THREE.PointLight(0xff7722, 1.8, 300, 1.2);
      torchLight.position.set(0, 18, 10);
      torchGroup.add(torchLight);
    }

    this.scene.add(torchGroup);

    this.torches.push({
      light: torchLight,
      flameMesh: flameMesh,
      baseIntensity: 1.8,
      flickerSpeed: 8 + Math.random() * 6,
      seed: Math.random() * 100
    });
  }

  // Add ornate framed painting on wall
  public addWallPainting(pos: THREE.Vector3, yawAngle: number, paintingIndex: number): void {
    const pGroup = new THREE.Group();
    pGroup.position.copy(pos);
    pGroup.rotation.y = yawAngle;

    const width = 36;
    const height = 52;
    const frameDepth = 3.5;

    // Outer Gold/Wood Frame
    const frameGeo = new THREE.BoxGeometry(width + 6, height + 6, frameDepth);
    const frameMesh = new THREE.Mesh(frameGeo, this.materials['goldFrame']);
    pGroup.add(frameMesh);

    // Canvas surface with oil painting texture
    const tex = this.paintingsTextures[paintingIndex % this.paintingsTextures.length];
    const canvasMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      metalness: 0.1
    });

    const canvasGeo = new THREE.PlaneGeometry(width, height);
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.set(0, 0, frameDepth * 0.5 + 0.1);
    pGroup.add(canvasMesh);

    this.scene.add(pGroup);
  }

  // Update animated torch flames and lights every frame
  public update(time: number): void {
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      // Organic fire flicker
      const flicker = Math.sin(time * t.flickerSpeed + t.seed) * 0.25 +
                      Math.cos(time * t.flickerSpeed * 1.7 + t.seed) * 0.15;
      if (t.light) {
        t.light.intensity = t.baseIntensity + flicker;
      }

      // Flame scale animation
      const scaleY = 1.0 + flicker * 0.35;
      const scaleXZ = 1.0 - flicker * 0.15;
      t.flameMesh.scale.set(scaleXZ, scaleY, scaleXZ);
    }
  }

  // Add an axis-aligned box with collision and mesh
  private addBox(
    min: THREE.Vector3,
    max: THREE.Vector3,
    materialKey: string,
    uvRepeat?: { repeatX: number; repeatY: number }
  ): void {
    const size = new THREE.Vector3(max.x - min.x, max.y - min.y, max.z - min.z);
    const center = new THREE.Vector3((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);

    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);

    let mat = this.materials[materialKey] || this.materials['wall'];
    if (uvRepeat && this.textures[materialKey]) {
      const tex = this.textures[materialKey].clone();
      tex.repeat.set(uvRepeat.repeatX, uvRepeat.repeatY);
      tex.needsUpdate = true;
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.7,
        metalness: 0.2
      });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.collisionWorld.boxes.push({
      type: 'box',
      min: min.clone(),
      max: max.clone()
    });
  }

  // Add an angled ramp collider and visual mesh
  public addRamp(start: THREE.Vector3, end: THREE.Vector3, width: number): void {
    const halfW = width * 0.5;
    const minX = Math.min(start.x, end.x) - halfW;
    const maxX = Math.max(start.x, end.x) + halfW;
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);

    const dir = end.clone().sub(start);
    const length = dir.length();

    const across = new THREE.Vector3(1, 0, 0);
    const normal = new THREE.Vector3().crossVectors(across, dir).normalize();
    if (normal.y < 0) normal.negate();

    const planeConstant = normal.dot(start);

    const rampGeo = new THREE.BoxGeometry(width, 6, length);
    const rampMesh = new THREE.Mesh(rampGeo, this.materials['ramp']);

    const midPoint = start.clone().add(end).multiplyScalar(0.5);
    rampMesh.position.copy(midPoint);
    rampMesh.lookAt(end.x, end.y, end.z);
    rampMesh.rotateX(Math.PI / 2);
    this.scene.add(rampMesh);

    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const supportGeo = new THREE.BoxGeometry(width, maxY - minY, length);
    const supportMesh = new THREE.Mesh(supportGeo, this.materials['stoneWall']);
    supportMesh.position.set(midPoint.x, minY + (maxY - minY) * 0.5 - 3, midPoint.z);
    this.scene.add(supportMesh);

    this.collisionWorld.ramps.push({
      type: 'ramp',
      start: start.clone(),
      end: end.clone(),
      minX,
      maxX,
      minZ,
      maxZ,
      normal: normal.clone(),
      planeNormal: normal.clone(),
      planeConstant
    });
  }

  // Add an interactive launch pad
  public addLaunchPad(min: THREE.Vector3, max: THREE.Vector3, boostVelocity: THREE.Vector3): void {
    const size = new THREE.Vector3(max.x - min.x, max.y - min.y, max.z - min.z);
    const center = new THREE.Vector3((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);

    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geo, this.materials['launchpad']);
    mesh.position.copy(center);
    this.scene.add(mesh);

    this.collisionWorld.triggers.push({
      type: 'launchpad',
      min: min.clone(),
      max: new THREE.Vector3(max.x, max.y + 15, max.z),
      boostVelocity: boostVelocity.clone()
    });

    this.collisionWorld.boxes.push({
      type: 'box',
      min: min.clone(),
      max: max.clone()
    });
  }
}
