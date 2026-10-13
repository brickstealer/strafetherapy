import * as THREE from 'three';

export interface BloodDecal {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  isPermanent: boolean;
}

export interface GibPiece {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  bounces: number;
  maxBounces: number;
  isResting: boolean;
  life: number;
  maxLife: number;
  isPermanent: boolean;
  splatTimer: number;
}

export interface BloodDropParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  prevPosition: THREE.Vector3;
  size: number;
  life: number;
  maxLife: number;
}

export class GoreSystem {
  private scene: THREE.Scene;

  // Decal Textures
  private poolTexture: THREE.CanvasTexture;
  private splatterTexture: THREE.CanvasTexture;
  private wallDripTexture: THREE.CanvasTexture;
  private dropletTexture: THREE.CanvasTexture;

  // Decal Materials pool
  private poolMaterial: THREE.MeshStandardMaterial;
  private splatterMaterial: THREE.MeshStandardMaterial;
  private wallDripMaterial: THREE.MeshStandardMaterial;
  private dropletMaterial: THREE.MeshStandardMaterial;

  // Active items
  private decals: BloodDecal[] = [];
  private gibs: GibPiece[] = [];
  private drops: BloodDropParticle[] = [];

  // Particle Point Cloud for fast droplet rendering
  private dropGeo: THREE.BufferGeometry;
  private dropMat: THREE.PointsMaterial;
  private dropPointsMesh: THREE.Points;
  private dropPositionsArray: Float32Array;

  // Maximum caps for performance safety (ring buffer)
  private static readonly MAX_DECALS = 800;
  private static readonly MAX_GIBS = 120;
  private static readonly MAX_DROPS = 1200;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Generate Procedural High-Res Blood Textures
    this.poolTexture = this.generateBloodPoolCanvas();
    this.splatterTexture = this.generateBloodSplatterCanvas();
    this.wallDripTexture = this.generateWallDripCanvas();
    this.dropletTexture = this.generateDropletCanvas();

    // 2. Setup Standard Materials (Viscous wet blood with subtle gloss)
    this.poolMaterial = new THREE.MeshStandardMaterial({
      map: this.poolTexture,
      transparent: true,
      roughness: 0.15,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
      depthWrite: false
    });

    this.splatterMaterial = new THREE.MeshStandardMaterial({
      map: this.splatterTexture,
      transparent: true,
      roughness: 0.2,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
      depthWrite: false
    });

    this.wallDripMaterial = new THREE.MeshStandardMaterial({
      map: this.wallDripTexture,
      transparent: true,
      roughness: 0.2,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
      depthWrite: false
    });

    this.dropletMaterial = new THREE.MeshStandardMaterial({
      map: this.dropletTexture,
      transparent: true,
      roughness: 0.25,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5,
      depthWrite: false
    });

    // 3. Fast GPU Particle System for Air Blood Droplets
    this.dropPositionsArray = new Float32Array(GoreSystem.MAX_DROPS * 3);
    this.dropGeo = new THREE.BufferGeometry();
    this.dropGeo.setAttribute('position', new THREE.BufferAttribute(this.dropPositionsArray, 3));

    this.dropMat = new THREE.PointsMaterial({
      color: 0x880008,
      size: 4.5,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      map: this.dropletTexture
    });

    this.dropPointsMesh = new THREE.Points(this.dropGeo, this.dropMat);
    this.dropPointsMesh.frustumCulled = false;
    this.scene.add(this.dropPointsMesh);
  }

  // ---------------------------------------------------------------------------
  // Canvas Texture Generators (Procedural Viscous Blood)
  // ---------------------------------------------------------------------------
  private generateBloodPoolCanvas(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    // Organic amoeba-like blood puddle
    ctx.fillStyle = '#660006';
    ctx.beginPath();
    const points = 24;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const r = 85 + Math.sin(a * 4) * 18 + Math.cos(a * 7) * 12 + (Math.random() - 0.5) * 8;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Dark thick coagulated blood core
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 65);
    coreGrad.addColorStop(0, '#2d0004');
    coreGrad.addColorStop(0.7, '#4f0007');
    coreGrad.addColorStop(1, 'rgba(79, 0, 7, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 65, 0, Math.PI * 2);
    ctx.fill();

    // Splattered satellite droplets around main puddle
    for (let j = 0; j < 35; j++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 34;
      const rad = 2 + Math.random() * 6;
      ctx.fillStyle = Math.random() > 0.4 ? '#80000a' : '#550005';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private generateBloodSplatterCanvas(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    // High velocity directional impact spray
    ctx.fillStyle = '#7a0008';
    for (let s = 0; s < 14; s++) {
      const angle = (s / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const len = 40 + Math.random() * 85;
      const w = 4 + Math.random() * 8;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle - 0.1) * len * 0.4, cy + Math.sin(angle - 0.1) * len * 0.4);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.lineTo(cx + Math.cos(angle + 0.1) * len * 0.4, cy + Math.sin(angle + 0.1) * len * 0.4);
      ctx.closePath();
      ctx.fill();

      // Droplets at tip
      const tipX = cx + Math.cos(angle) * (len + 8 + Math.random() * 15);
      const tipY = cy + Math.sin(angle) * (len + 8 + Math.random() * 15);
      ctx.beginPath();
      ctx.arc(tipX, tipY, w * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Central impact dot
    ctx.fillStyle = '#3a0004';
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private generateWallDripCanvas(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const topY = 40;

    // Initial wall impact smear
    ctx.fillStyle = '#6b0007';
    ctx.beginPath();
    ctx.ellipse(cx, topY, 48, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gravity drips running down the wall
    const drips = [
      { x: cx - 24, length: 110, w: 8 },
      { x: cx - 8, length: 175, w: 11 },
      { x: cx + 12, length: 140, w: 9 },
      { x: cx + 28, length: 85, w: 6 }
    ];

    drips.forEach((d) => {
      ctx.fillStyle = '#7a0009';
      ctx.beginPath();
      ctx.moveTo(d.x - d.w * 0.5, topY);
      ctx.lineTo(d.x - d.w * 0.3, topY + d.length * 0.7);
      ctx.lineTo(d.x - d.w * 0.7, topY + d.length);
      ctx.arc(d.x, topY + d.length, d.w * 0.7, 0, Math.PI);
      ctx.lineTo(d.x + d.w * 0.3, topY + d.length * 0.7);
      ctx.lineTo(d.x + d.w * 0.5, topY);
      ctx.closePath();
      ctx.fill();

      // Teardrop falling droplet below drip
      ctx.beginPath();
      ctx.arc(d.x, topY + d.length + 18, d.w * 0.45, 0, Math.PI * 2);
      ctx.fill();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private generateDropletCanvas(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grad.addColorStop(0, '#99000a');
    grad.addColorStop(0.5, '#550005');
    grad.addColorStop(0.85, '#2b0003');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API: Trigger Brutal Gib Explosion & Massive Blood Fountain
  // ---------------------------------------------------------------------------
  public spawnGibExplosion(
    origin: THREE.Vector3,
    hitDir: THREE.Vector3 | undefined,
    goreLevel: number = 3,
    bloodDuration: number = Infinity
  ): void {
    if (goreLevel <= 0) return;

    // Scale counts based on Gore Level (1: Low, 2: Mid, 3: Brutal, 4: Ludicrous)
    const multiplier = goreLevel === 1 ? 0.4 : goreLevel === 2 ? 0.8 : goreLevel === 3 ? 1.4 : 2.5;

    // 1. Spawn Gory 3D Body Gibs
    const numGibs = Math.floor((10 + Math.random() * 8) * multiplier);
    for (let i = 0; i < numGibs; i++) {
      this.createGibPiece(origin, hitDir, bloodDuration);
    }

    // 2. Spawn Directional Air Blood Spurt Jets & Droplets
    const numDrops = Math.floor((120 + Math.random() * 80) * multiplier);
    for (let i = 0; i < numDrops; i++) {
      this.createBloodDrop(origin, hitDir, 450 * multiplier);
    }

    // 3. Spawn Immediate Large Impact Pool on the Ground Underneath
    const groundY = origin.y >= 120 ? 140 : 0;
    this.spawnFloorDecal(
      new THREE.Vector3(origin.x, groundY, origin.z),
      (55 + Math.random() * 35) * multiplier,
      'pool',
      bloodDuration
    );

    // 4. Spawn 2-4 surrounding splatters
    const numSplats = Math.floor(3 * multiplier);
    for (let k = 0; k < numSplats; k++) {
      const offX = (Math.random() - 0.5) * 80;
      const offZ = (Math.random() - 0.5) * 80;
      this.spawnFloorDecal(
        new THREE.Vector3(origin.x + offX, groundY, origin.z + offZ),
        (32 + Math.random() * 26) * multiplier,
        'splatter',
        bloodDuration
      );
    }
  }

  // Spawn smaller blood spray when bot takes damage (non-lethal hit)
  public spawnBloodHit(
    origin: THREE.Vector3,
    hitDir: THREE.Vector3,
    goreLevel: number = 3,
    bloodDuration: number = Infinity
  ): void {
    if (goreLevel <= 0) return;
    const multiplier = goreLevel === 1 ? 0.3 : goreLevel === 2 ? 0.7 : goreLevel === 3 ? 1.2 : 2.0;

    const numDrops = Math.floor((25 + Math.random() * 20) * multiplier);
    for (let i = 0; i < numDrops; i++) {
      this.createBloodDrop(origin, hitDir, 320 * multiplier);
    }

    // Direct splatter spray on floor from the wound
    if (Math.random() < 0.5 * multiplier) {
      const floorY = origin.y >= 135 ? 140 : 0;
      this.spawnFloorDecal(
        new THREE.Vector3(origin.x + (Math.random() - 0.5) * 15, floorY, origin.z + (Math.random() - 0.5) * 15),
        16 + Math.random() * 14 * multiplier,
        'splatter',
        bloodDuration
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3D GIB CREATION & BALISTIC PHYSICS
  // ---------------------------------------------------------------------------
  private createGibPiece(
    origin: THREE.Vector3,
    hitDir: THREE.Vector3 | undefined,
    bloodDuration: number
  ): void {
    if (this.gibs.length >= GoreSystem.MAX_GIBS) {
      const oldest = this.gibs.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }

    const gibGroup = new THREE.Group();
    const pieceType = Math.floor(Math.random() * 5); // 0: skull, 1: ribcage, 2: bone, 3: visceral flesh, 4: vertebra

    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xddd0b8,
      roughness: 0.5,
      metalness: 0.1
    });

    const goryFleshMat = new THREE.MeshStandardMaterial({
      color: 0x5a0307,
      roughness: 0.25,
      metalness: 0.2
    });

    if (pieceType === 0) {
      // Skull with hollow eye sockets
      const skullGeo = new THREE.BoxGeometry(7, 8, 8);
      const skullMesh = new THREE.Mesh(skullGeo, boneMat);
      gibGroup.add(skullMesh);

      // Red burning ember eye holes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.5), eyeMat);
      eyeL.position.set(-1.8, 0.8, 4.1);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.5), eyeMat);
      eyeR.position.set(1.8, 0.8, 4.1);
      gibGroup.add(eyeL);
      gibGroup.add(eyeR);
    } else if (pieceType === 1) {
      // Ribcage fragment
      const ribGeo = new THREE.TorusGeometry(5.5, 1.2, 6, 8, Math.PI * 1.2);
      const ribMesh = new THREE.Mesh(ribGeo, boneMat);
      gibGroup.add(ribMesh);

      // Bloody core tissue
      const meatGeo = new THREE.DodecahedronGeometry(3.2);
      const meatMesh = new THREE.Mesh(meatGeo, goryFleshMat);
      gibGroup.add(meatMesh);
    } else if (pieceType === 2) {
      // Long Femur/Shin bone
      const shaftGeo = new THREE.CylinderGeometry(1.1, 1.1, 14, 6);
      const shaft = new THREE.Mesh(shaftGeo, boneMat);
      gibGroup.add(shaft);

      const headGeo = new THREE.SphereGeometry(2.0, 6, 6);
      const head1 = new THREE.Mesh(headGeo, boneMat);
      head1.position.set(0, 7, 0);
      const head2 = new THREE.Mesh(headGeo, boneMat);
      head2.position.set(0, -7, 0);
      gibGroup.add(head1);
      gibGroup.add(head2);
    } else if (pieceType === 3) {
      // Bloody visceral flesh chunk
      const fleshGeo = new THREE.DodecahedronGeometry(4.5 + Math.random() * 3);
      const fleshMesh = new THREE.Mesh(fleshGeo, goryFleshMat);
      gibGroup.add(fleshMesh);
    } else {
      // Spine vertebrae link
      const vertGeo = new THREE.BoxGeometry(5, 5, 4);
      const vertMesh = new THREE.Mesh(vertGeo, boneMat);
      gibGroup.add(vertMesh);
    }

    gibGroup.position.copy(origin);
    gibGroup.position.y += 20 + (Math.random() - 0.5) * 30;
    this.scene.add(gibGroup);

    // Initial Explosive Velocity Vector
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 650,
      280 + Math.random() * 420,
      (Math.random() - 0.5) * 650
    );

    if (hitDir) {
      vel.addScaledVector(hitDir, 420);
    }

    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 18
    );

    const isPerm = !Number.isFinite(bloodDuration);

    this.gibs.push({
      mesh: gibGroup,
      position: gibGroup.position.clone(),
      velocity: vel,
      angularVelocity: angVel,
      bounces: 0,
      maxBounces: 2 + Math.floor(Math.random() * 2),
      isResting: false,
      life: isPerm ? 999999 : bloodDuration,
      maxLife: isPerm ? 999999 : bloodDuration,
      isPermanent: isPerm,
      splatTimer: 0
    });
  }

  // ---------------------------------------------------------------------------
  // BLOOD DROP PARTICLES (Airborne droplet jets)
  // ---------------------------------------------------------------------------
  private createBloodDrop(origin: THREE.Vector3, hitDir: THREE.Vector3 | undefined, baseSpeed: number): void {
    if (this.drops.length >= GoreSystem.MAX_DROPS) {
      this.drops.shift();
    }

    const startPos = origin.clone();
    startPos.y += 25 + (Math.random() - 0.5) * 40;

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * baseSpeed * 1.4,
      120 + Math.random() * baseSpeed * 0.9,
      (Math.random() - 0.5) * baseSpeed * 1.4
    );

    if (hitDir) {
      vel.addScaledVector(hitDir, baseSpeed * 1.2);
    }

    this.drops.push({
      position: startPos.clone(),
      velocity: vel,
      prevPosition: startPos.clone(),
      size: 3.5 + Math.random() * 3.5,
      life: 2.2,
      maxLife: 2.2
    });
  }

  // ---------------------------------------------------------------------------
  // BLOOD DECAL SPAWNERS (Floor puddles & Wall drips/splats)
  // ---------------------------------------------------------------------------
  public spawnFloorDecal(
    pos: THREE.Vector3,
    radius: number,
    type: 'pool' | 'splatter' | 'droplets' = 'splatter',
    bloodDuration: number = Infinity
  ): void {
    if (this.decals.length >= GoreSystem.MAX_DECALS) {
      const oldest = this.decals.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }

    const mat =
      type === 'pool'
        ? this.poolMaterial.clone()
        : type === 'splatter'
        ? this.splatterMaterial.clone()
        : this.dropletMaterial.clone();

    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const mesh = new THREE.Mesh(geo, mat);

    // Lay flat horizontally on floor with minute vertical offset to prevent z-fighting
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(pos.x, pos.y + 0.12, pos.z);
    mesh.receiveShadow = false;

    this.scene.add(mesh);

    const isPerm = !Number.isFinite(bloodDuration);
    this.decals.push({
      mesh,
      life: isPerm ? 999999 : bloodDuration,
      maxLife: isPerm ? 999999 : bloodDuration,
      isPermanent: isPerm
    });
  }

  public spawnWallDecal(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    radius: number,
    bloodDuration: number = Infinity
  ): void {
    if (this.decals.length >= GoreSystem.MAX_DECALS) {
      const oldest = this.decals.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }

    const mat = Math.random() > 0.4 ? this.wallDripMaterial.clone() : this.splatterMaterial.clone();
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const mesh = new THREE.Mesh(geo, mat);

    // Orient decal flush with the wall normal
    mesh.position.copy(pos).addScaledVector(normal, 0.15);
    mesh.lookAt(pos.clone().add(normal));
    mesh.rotation.z = (Math.random() - 0.5) * 0.3; // Slight tilt
    mesh.receiveShadow = false;

    this.scene.add(mesh);

    const isPerm = !Number.isFinite(bloodDuration);
    this.decals.push({
      mesh,
      life: isPerm ? 999999 : bloodDuration,
      maxLife: isPerm ? 999999 : bloodDuration,
      isPermanent: isPerm
    });
  }

  // ---------------------------------------------------------------------------
  // UPDATE LOOP (Gib bouncing, particle simulation, decal fading)
  // ---------------------------------------------------------------------------
  public update(dt: number, bloodDurationSetting: number): void {
    const gravity = 820.0;
    const ringOuterRadius = 3250;

    // 1. SIMULATE ACTIVE GIBS
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];

      if (!g.isResting) {
        g.velocity.y -= gravity * dt;
        g.position.addScaledVector(g.velocity, dt);

        // Rotation
        g.mesh.rotation.x += g.angularVelocity.x * dt;
        g.mesh.rotation.y += g.angularVelocity.y * dt;
        g.mesh.rotation.z += g.angularVelocity.z * dt;

        // Droplet trail behind flying gib
        g.splatTimer -= dt;
        if (g.splatTimer <= 0) {
          this.createBloodDrop(g.position, undefined, 120);
          g.splatTimer = 0.045;
        }

        // Determine floor surface level (Ground at y = 0, or Floor 2 at y = 140)
        let floorY = 0;
        if (g.position.y >= 135) {
          floorY = 140;
        }

        // Bounce against floor
        if (g.position.y <= floorY) {
          g.position.y = floorY;
          g.bounces++;

          // Leave splat on floor
          this.spawnFloorDecal(
            new THREE.Vector3(g.position.x, floorY, g.position.z),
            24 + Math.random() * 20,
            'splatter',
            bloodDurationSetting
          );

          if (g.bounces >= g.maxBounces || Math.abs(g.velocity.y) < 60) {
            // Come to complete rest on floor
            g.isResting = true;
            g.velocity.set(0, 0, 0);
            g.angularVelocity.set(0, 0, 0);
            // Spawn puddle under resting gib
            this.spawnFloorDecal(
              new THREE.Vector3(g.position.x, floorY, g.position.z),
              38 + Math.random() * 24,
              'pool',
              bloodDurationSetting
            );
          } else {
            // Restitution bounce
            g.velocity.y = -g.velocity.y * 0.38;
            g.velocity.x *= 0.65;
            g.velocity.z *= 0.65;
            g.angularVelocity.multiplyScalar(0.7);
          }
        }

        // Bounce against outer wall
        const dist = Math.hypot(g.position.x, g.position.z);
        if (dist >= ringOuterRadius - 20) {
          const norm = new THREE.Vector3(-g.position.x / dist, 0, -g.position.z / dist);
          this.spawnWallDecal(g.position, norm, 28, bloodDurationSetting);
          g.velocity.x = -g.velocity.x * 0.4;
          g.velocity.z = -g.velocity.z * 0.4;
        }

        g.mesh.position.copy(g.position);
      } else {
        // Resting gib decal lifetime
        if (!g.isPermanent && Number.isFinite(bloodDurationSetting)) {
          g.life -= dt;
          if (g.life <= 0) {
            this.scene.remove(g.mesh);
            this.gibs.splice(i, 1);
            continue;
          }
        }
      }
    }

    // 2. SIMULATE AIRBORNE BLOOD DROPLETS
    let activeDropCount = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;

      if (d.life <= 0) {
        this.drops.splice(i, 1);
        continue;
      }

      d.prevPosition.copy(d.position);
      d.velocity.y -= gravity * 0.9 * dt;
      d.velocity.x *= Math.pow(0.92, dt * 60);
      d.velocity.z *= Math.pow(0.92, dt * 60);
      d.position.addScaledVector(d.velocity, dt);

      // Check collision with Floor (0 or 140)
      let floorY = 0;
      if (d.position.y >= 135) {
        floorY = 140;
      }

      let hitSurface = false;
      if (d.position.y <= floorY) {
        hitSurface = true;
        this.spawnFloorDecal(
          new THREE.Vector3(d.position.x, floorY, d.position.z),
          d.size * 3.2,
          d.size > 5.5 ? 'splatter' : 'droplets',
          bloodDurationSetting
        );
      }

      // Check collision with Outer Circular Wall
      const dist = Math.hypot(d.position.x, d.position.z);
      if (dist >= ringOuterRadius - 15) {
        hitSurface = true;
        const norm = new THREE.Vector3(-d.position.x / dist, 0, -d.position.z / dist);
        this.spawnWallDecal(d.position, norm, d.size * 3.8, bloodDurationSetting);
      }

      if (hitSurface) {
        this.drops.splice(i, 1);
        continue;
      }

      // Pack into particle buffer
      this.dropPositionsArray[activeDropCount * 3] = d.position.x;
      this.dropPositionsArray[activeDropCount * 3 + 1] = d.position.y;
      this.dropPositionsArray[activeDropCount * 3 + 2] = d.position.z;
      activeDropCount++;
    }

    // Clear unused buffer vertices
    for (let k = activeDropCount; k < GoreSystem.MAX_DROPS; k++) {
      this.dropPositionsArray[k * 3] = 0;
      this.dropPositionsArray[k * 3 + 1] = -99999;
      this.dropPositionsArray[k * 3 + 2] = 0;
    }
    this.dropGeo.attributes.position.needsUpdate = true;

    // 3. FADE & PRUNE DECALS BASED ON SETTINGS
    const isInfinite = !Number.isFinite(bloodDurationSetting);

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const dec = this.decals[i];

      if (!isInfinite && !dec.isPermanent) {
        dec.life -= dt;
        if (dec.life <= 0) {
          this.scene.remove(dec.mesh);
          this.decals.splice(i, 1);
          continue;
        }

        // Smooth fade out in the last 4 seconds
        if (dec.life < 4.0) {
          const mat = dec.mesh.material as THREE.MeshStandardMaterial;
          mat.opacity = Math.max(0, dec.life / 4.0);
        }
      }
    }
  }

  // Clear all blood decals and gibs from the arena
  public clearAll(): void {
    for (const d of this.decals) this.scene.remove(d.mesh);
    this.decals = [];
    for (const g of this.gibs) this.scene.remove(g.mesh);
    this.gibs = [];
    this.drops = [];
  }

  public dispose(): void {
    this.clearAll();
    this.scene.remove(this.dropPointsMesh);
    this.dropGeo.dispose();
    this.dropMat.dispose();
    this.poolTexture.dispose();
    this.splatterTexture.dispose();
    this.wallDripTexture.dispose();
    this.dropletTexture.dispose();
  }
}
