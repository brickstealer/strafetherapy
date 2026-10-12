import * as THREE from 'three';

// Procedurally generated particle textures for cinematic photorealistic FX
class ParticleTextureAtlas {
  public smokeTexture: THREE.CanvasTexture;
  public sparkTexture: THREE.CanvasTexture;
  public shockwaveTexture: THREE.CanvasTexture;
  public scorchTexture: THREE.CanvasTexture;

  constructor() {
    this.smokeTexture = this.generateSmokeCanvas();
    this.sparkTexture = this.generateSparkCanvas();
    this.shockwaveTexture = this.generateShockwaveCanvas();
    this.scorchTexture = this.generateScorchCanvas();
  }

  private generateSmokeCanvas(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(240, 240, 240, 0.85)');
    grad.addColorStop(0.65, 'rgba(180, 180, 180, 0.35)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Add soft turbulent puff lobes for organic smoke billow look
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const r = 24 + Math.random() * 16;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      const subGrad = ctx.createRadialGradient(px, py, 0, px, py, 32);
      subGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.4)');
      subGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = subGrad;
      ctx.beginPath();
      ctx.arc(px, py, 32, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private generateSparkCanvas(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.2, 'rgba(255, 220, 120, 0.9)');
    grad.addColorStop(0.5, 'rgba(255, 120, 20, 0.5)');
    grad.addColorStop(1.0, 'rgba(255, 60, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Starburst cross flares
    ctx.strokeStyle = 'rgba(255, 255, 220, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy);
    ctx.lineTo(cx + 24, cy);
    ctx.moveTo(cx, cy - 24);
    ctx.lineTo(cx, cy + 24);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private generateShockwaveCanvas(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 28, cx, cy, 62);
    grad.addColorStop(0.0, 'rgba(255, 160, 40, 0.0)');
    grad.addColorStop(0.4, 'rgba(255, 220, 120, 0.95)');
    grad.addColorStop(0.7, 'rgba(255, 100, 20, 0.7)');
    grad.addColorStop(1.0, 'rgba(200, 30, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private generateScorchCanvas(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 58);
    grad.addColorStop(0.0, 'rgba(10, 10, 12, 0.95)');
    grad.addColorStop(0.45, 'rgba(25, 20, 18, 0.75)');
    grad.addColorStop(0.75, 'rgba(40, 25, 15, 0.35)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }
}

// Active smoke or flame puff sprite
interface PuffParticle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  growthRate: number;
  rotationSpeed: number;
  life: number;
  maxLife: number;
  initialScale: number;
  maxScale: number;
  isFireBillow: boolean;
}

// Flying burning shrapnel ember
interface EmberParticle {
  mesh: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
}

// Expanding shockwave ring
interface ShockwaveFX {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

// Ground scorch decal
interface ScorchDecal {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

// Light flash
interface FlashFX {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  maxIntensity: number;
}

export class ExplosionFXManager {
  private scene: THREE.Scene;
  private atlas: ParticleTextureAtlas;

  private activePuffs: PuffParticle[] = [];
  private activeEmbers: EmberParticle[] = [];
  private activeShockwaves: ShockwaveFX[] = [];
  private activeScorches: ScorchDecal[] = [];
  private activeFlashes: FlashFX[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.atlas = new ParticleTextureAtlas();
  }

  // -------------------------------------------------------------------------
  // ROCKET TRAIL: Dense swirling smoke billows & sparkling thruster embers
  // -------------------------------------------------------------------------
  public spawnRocketTrailPuff(pos: THREE.Vector3, rocketDir: THREE.Vector3): void {
    const spriteMat = new THREE.SpriteMaterial({
      map: this.atlas.smokeTexture,
      color: 0x888888,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const sprite = new THREE.Sprite(spriteMat);
    // Slight random offset behind nozzle
    const offsetPos = pos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5
    ));
    sprite.position.copy(offsetPos);
    sprite.scale.set(6, 6, 1);
    this.scene.add(sprite);

    // Drifts backwards with slow upward thermal draft
    const vel = rocketDir.clone().multiplyScalar(-25).add(new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      12 + Math.random() * 10,
      (Math.random() - 0.5) * 8
    ));

    this.activePuffs.push({
      sprite,
      velocity: vel,
      growthRate: 36,
      rotationSpeed: (Math.random() - 0.5) * 2.5,
      life: 0.65,
      maxLife: 0.65,
      initialScale: 6,
      maxScale: 28,
      isFireBillow: false
    });
  }

  public spawnRocketThrusterSpark(pos: THREE.Vector3, rocketDir: THREE.Vector3): void {
    const spriteMat = new THREE.SpriteMaterial({
      map: this.atlas.sparkTexture,
      color: 0xffaa22,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(pos);
    sprite.scale.set(3.5, 3.5, 1);
    this.scene.add(sprite);

    const vel = rocketDir.clone().multiplyScalar(-140).add(new THREE.Vector3(
      (Math.random() - 0.5) * 45,
      (Math.random() - 0.5) * 45,
      (Math.random() - 0.5) * 45
    ));

    this.activeEmbers.push({
      mesh: sprite,
      velocity: vel,
      life: 0.18,
      maxLife: 0.18,
      initialScale: 3.5
    });
  }

  // -------------------------------------------------------------------------
  // FULL CINEMATIC EXPLOSION: Flash, Fireball Billows, Shockwave, Shrapnel, Scorch
  // -------------------------------------------------------------------------
  public triggerExplosion(pos: THREE.Vector3): void {
    // 1. Blinding Incandescent Flash Light
    const flashLight = new THREE.PointLight(0xff7711, 16.0, 480);
    flashLight.position.copy(pos);
    this.scene.add(flashLight);
    this.activeFlashes.push({
      light: flashLight,
      life: 0.45,
      maxLife: 0.45,
      maxIntensity: 16.0
    });

    // 2. Fiery Blast Core & Expanding Volumetric Fire Billows
    const billowCount = 18;
    for (let i = 0; i < billowCount; i++) {
      // Color progression: bright fiery orange-yellow
      const spriteMat = new THREE.SpriteMaterial({
        map: this.atlas.smokeTexture,
        color: 0xff6600,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending // Glows like molten plasma initially
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(pos);
      const startSize = 12 + Math.random() * 8;
      sprite.scale.set(startSize, startSize, 1);
      this.scene.add(sprite);

      // Radial outward supersonic blast velocity
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const speed = 160 + Math.random() * 280;
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.abs(Math.sin(phi) * Math.sin(theta)) * 0.9 + 0.35, // biased upwards
        Math.cos(phi)
      ).multiplyScalar(speed);

      this.activePuffs.push({
        sprite,
        velocity: vel,
        growthRate: 110,
        rotationSpeed: (Math.random() - 0.5) * 3.5,
        life: 0.75 + Math.random() * 0.35,
        maxLife: 0.75 + Math.random() * 0.35,
        initialScale: startSize,
        maxScale: 65 + Math.random() * 30,
        isFireBillow: true
      });
    }

    // 3. Shockwave Expanding Distortion Ring
    const shockGeo = new THREE.PlaneGeometry(1, 1);
    const shockMat = new THREE.MeshBasicMaterial({
      map: this.atlas.shockwaveTexture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const shockMesh = new THREE.Mesh(shockGeo, shockMat);
    shockMesh.position.copy(pos);
    shockMesh.rotation.x = Math.PI / 2; // Flat on horizontal plane
    this.scene.add(shockMesh);

    this.activeShockwaves.push({
      mesh: shockMesh,
      life: 0.38,
      maxLife: 0.38,
      startScale: 8,
      endScale: 190
    });

    // 4. Burning Shrapnel & High-Speed Embers
    const emberCount = 36;
    for (let i = 0; i < emberCount; i++) {
      const emberMat = new THREE.SpriteMaterial({
        map: this.atlas.sparkTexture,
        color: Math.random() > 0.3 ? 0xffcc33 : 0xff4400,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const emberSprite = new THREE.Sprite(emberMat);
      emberSprite.position.copy(pos);
      const sz = 3.5 + Math.random() * 3.0;
      emberSprite.scale.set(sz, sz, 1);
      this.scene.add(emberSprite);

      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const speed = 320 + Math.random() * 450;
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.abs(Math.cos(phi)) * 0.85 + 0.3,
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(speed);

      this.activeEmbers.push({
        mesh: emberSprite,
        velocity: vel,
        life: 0.7 + Math.random() * 0.55,
        maxLife: 0.7 + Math.random() * 0.55,
        initialScale: sz
      });
    }

    // 5. Scorch Mark Decal on Citadel Floor
    if (pos.y < 75) {
      const scorchGeo = new THREE.PlaneGeometry(64, 64);
      const scorchMat = new THREE.MeshBasicMaterial({
        map: this.atlas.scorchTexture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
      scorchMesh.rotation.x = -Math.PI / 2;
      scorchMesh.position.set(pos.x, 0.12, pos.z);
      this.scene.add(scorchMesh);

      this.activeScorches.push({
        mesh: scorchMesh,
        life: 14.0,
        maxLife: 14.0
      });
    }
  }

  // -------------------------------------------------------------------------
  // UPDATE LOOP: Physics, fading, color temperature transitions
  // -------------------------------------------------------------------------
  public update(dt: number): void {
    // 1. Update Smoke & Fire Billows
    for (let i = this.activePuffs.length - 1; i >= 0; i--) {
      const p = this.activePuffs[i];
      p.life -= dt;
      const progress = 1.0 - p.life / p.maxLife;

      // Position update with friction drag and buoyancy
      p.velocity.multiplyScalar(Math.pow(0.88, dt * 60));
      p.velocity.y += 18 * dt; // Hot smoke rises
      p.sprite.position.addScaledVector(p.velocity, dt);

      // Growth expansion
      const currentScale = p.initialScale + (p.maxScale - p.initialScale) * Math.sin(progress * Math.PI * 0.5);
      p.sprite.scale.set(currentScale, currentScale, 1);
      p.sprite.material.rotation += p.rotationSpeed * dt;

      if (p.isFireBillow) {
        // Realistic fire-to-smoke thermal transition:
        // 0.0 - 0.25: Molten bright orange/yellow plasma
        // 0.25 - 0.55: Darkening deep red flame
        // 0.55 - 1.0: Dense dark charcoal smoke
        if (progress < 0.25) {
          p.sprite.material.color.setHex(0xff7700);
          p.sprite.material.opacity = 0.95;
        } else if (progress < 0.55) {
          p.sprite.material.blending = THREE.NormalBlending;
          p.sprite.material.color.setHex(0x992200);
          p.sprite.material.opacity = 0.8;
        } else {
          p.sprite.material.color.setHex(0x222224);
          p.sprite.material.opacity = Math.max(0, 0.7 * (1.0 - (progress - 0.55) / 0.45));
        }
      } else {
        // Regular trail smoke fading
        p.sprite.material.opacity = Math.max(0, 0.55 * (1.0 - progress));
      }

      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.activePuffs.splice(i, 1);
      }
    }

    // 2. Update Burning Shrapnel Embers
    for (let i = this.activeEmbers.length - 1; i >= 0; i--) {
      const e = this.activeEmbers[i];
      e.life -= dt;
      const progress = 1.0 - e.life / e.maxLife;

      // Gravity and air drag
      e.velocity.y -= 750 * dt;
      e.velocity.multiplyScalar(Math.pow(0.96, dt * 60));
      e.mesh.position.addScaledVector(e.velocity, dt);

      // Bounce off ground
      if (e.mesh.position.y < 0.2) {
        e.mesh.position.y = 0.2;
        e.velocity.y = Math.abs(e.velocity.y) * 0.45;
        e.velocity.x *= 0.65;
        e.velocity.z *= 0.65;
      }

      // Shrink and fade
      const sc = e.initialScale * (1.0 - progress * 0.8);
      e.mesh.scale.set(sc, sc, 1);
      e.mesh.material.opacity = Math.max(0, 1.0 - progress);

      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.material.dispose();
        this.activeEmbers.splice(i, 1);
      }
    }

    // 3. Update Shockwave Rings
    for (let i = this.activeShockwaves.length - 1; i >= 0; i--) {
      const sw = this.activeShockwaves[i];
      sw.life -= dt;
      const progress = 1.0 - sw.life / sw.maxLife;

      const sc = sw.startScale + (sw.endScale - sw.startScale) * Math.sin(progress * Math.PI * 0.5);
      sw.mesh.scale.set(sc, sc, 1);

      const mat = sw.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.9 * (1.0 - progress));

      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        mat.dispose();
        this.activeShockwaves.splice(i, 1);
      }
    }

    // 4. Update Flashes
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const fl = this.activeFlashes[i];
      fl.life -= dt;
      const progress = 1.0 - fl.life / fl.maxLife;

      fl.light.intensity = fl.maxIntensity * Math.pow(1.0 - progress, 2);

      if (fl.life <= 0) {
        this.scene.remove(fl.light);
        this.activeFlashes.splice(i, 1);
      }
    }

    // 5. Update Scorches
    for (let i = this.activeScorches.length - 1; i >= 0; i--) {
      const sc = this.activeScorches[i];
      sc.life -= dt;
      const mat = sc.mesh.material as THREE.MeshBasicMaterial;

      if (sc.life < 3.0) {
        mat.opacity = (sc.life / 3.0) * 0.85;
      }

      if (sc.life <= 0) {
        this.scene.remove(sc.mesh);
        sc.mesh.geometry.dispose();
        mat.dispose();
        this.activeScorches.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    for (const p of this.activePuffs) this.scene.remove(p.sprite);
    for (const e of this.activeEmbers) this.scene.remove(e.mesh);
    for (const sw of this.activeShockwaves) this.scene.remove(sw.mesh);
    for (const f of this.activeFlashes) this.scene.remove(f.light);
    for (const sc of this.activeScorches) this.scene.remove(sc.mesh);
  }
}

