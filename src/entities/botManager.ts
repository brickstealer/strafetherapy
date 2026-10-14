import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { soundManager } from '../audio/synth';
import type { CastleMapBounds } from '../physics/pmove';
import type { GoreSystem } from '../graphics/goreSystem';

export interface BotDamageResult {
  hit: boolean;
  bot?: Bot;
  killed: boolean;
  damage: number;
  hitPoint?: THREE.Vector3;
  distance?: number;
}

export interface SkeletonTemplate {
  name: string;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class Bot {
  public mesh: THREE.Group;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public hp = 100;
  public maxHp = 100;
  public isAlive = true;
  public radius = 40;
  public height = 110;
  public respawnTimer = 0;

  // AI navigation state
  private targetPos = new THREE.Vector3();
  private moveSpeed = 260;
  private changeTargetTimer = 0;
  private hopTimer = 0;
  private flashTimer = 0;

  // 3D Animated Skinned Model
  private model: THREE.Group;
  private mixer!: THREE.AnimationMixer;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentActionName = 'idle';

  // Skinned meshes for hit flashes
  private skinnedMeshes: THREE.SkinnedMesh[] = [];
  private hpBarFill!: THREE.Mesh;
  private hpBarGroup!: THREE.Group;
  private eyeLight?: THREE.PointLight;
  public goreSystem?: GoreSystem;

  constructor(scene: THREE.Scene, initialPos: THREE.Vector3, template: SkeletonTemplate, goreSystem?: GoreSystem) {
    this.position = initialPos.clone();
    this.velocity = new THREE.Vector3();
    this.mesh = new THREE.Group();
    this.goreSystem = goreSystem;

    // 1. Clone realistic skeletal character model (enlarged giant skeleton)
    this.model = cloneSkeleton(template.scene) as THREE.Group;
    this.model.scale.setScalar(52.0); // Imposing giant skeleton (~112 units tall)
    this.model.position.set(0, 0, 0);
    this.mesh.add(this.model);

    // 2. Setup shadows, glowing eyes, and hit flash targets
    this.setupModelFeatures();

    // 3. Setup Animations
    this.setupAnimations(template.animations);

    // 4. Setup Gothic Health Bar
    this.buildHealthBar();

    this.mesh.position.copy(this.position);
    scene.add(this.mesh);

    this.pickNewTarget();
  }

  private setupModelFeatures(): void {
    const bloodGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });

    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child instanceof THREE.SkinnedMesh) {
          this.skinnedMeshes.push(child);
        }

        // Detect eyes node and make them burn with dark hellfire
        const name = child.name.toLowerCase();
        if (name.includes('eye')) {
          child.material = bloodGlowMat;
          // Add demonic ember light
          if (!this.eyeLight) {
            this.eyeLight = new THREE.PointLight(0xff1133, 3.2, 70);
            this.eyeLight.position.set(0, 0, 0.2);
            child.add(this.eyeLight);
          }
        }
      }
    });
  }

  private setupAnimations(clips: THREE.AnimationClip[]): void {
    this.mixer = new THREE.AnimationMixer(this.model);

    const findClip = (...names: string[]): THREE.AnimationClip | undefined => {
      for (const n of names) {
        const c = clips.find((clip) => clip.name.toLowerCase() === n.toLowerCase());
        if (c) return c;
      }
      return undefined;
    };

    // Register primary gameplay animations
    const idleClip = findClip('Idle', 'Idle_Combat', 'Unarmed_Idle');
    const runClip = findClip('Running_B', 'Running_A', 'Running_C');
    const walkClip = findClip('Walking_A', 'Walking_B', 'Walking_D_Skeletons');
    const jumpClip = findClip('Jump_Idle', 'Jump_Full_Short', 'Jump_Start');
    const hitClip = findClip('Hit_A', 'Hit_B');
    const deathClip = findClip('Death_A', 'Death_B', 'Death_C_Skeletons');
    const spawnClip = findClip('Spawn_Ground_Skeletons', 'Spawn_Ground', 'Skeletons_Awaken_Floor');

    if (idleClip) this.actions.set('idle', this.mixer.clipAction(idleClip));
    if (runClip) this.actions.set('run', this.mixer.clipAction(runClip));
    if (walkClip) this.actions.set('walk', this.mixer.clipAction(walkClip));
    if (jumpClip) this.actions.set('jump', this.mixer.clipAction(jumpClip));

    if (hitClip) {
      const act = this.mixer.clipAction(hitClip);
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = false;
      this.actions.set('hit', act);
    }

    if (deathClip) {
      const act = this.mixer.clipAction(deathClip);
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
      this.actions.set('death', act);
    }

    if (spawnClip) {
      const act = this.mixer.clipAction(spawnClip);
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
      this.actions.set('spawn', act);
    }

    // Start with idle or run
    const initialAction = this.actions.get('idle') || this.actions.get('run');
    if (initialAction) {
      initialAction.play();
      this.currentActionName = 'idle';
    }
  }

  private playAction(name: string, fadeDuration = 0.2): void {
    if (this.currentActionName === name) return;
    const nextAct = this.actions.get(name);
    const currAct = this.actions.get(this.currentActionName);

    if (nextAct) {
      nextAct.reset();
      nextAct.enabled = true;
      if (currAct) {
        currAct.crossFadeTo(nextAct, fadeDuration, true);
      }
      nextAct.play();
      this.currentActionName = name;
    }
  }

  private buildHealthBar(): void {
    this.hpBarGroup = new THREE.Group();
    this.hpBarGroup.position.set(0, 118, 0);

    const bgGeo = new THREE.PlaneGeometry(48, 5.2);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x090d16, side: THREE.DoubleSide });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.hpBarGroup.add(bgMesh);

    const fillGeo = new THREE.PlaneGeometry(45, 3.8);
    fillGeo.translate(22.5, 0, 0);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide });
    this.hpBarFill = new THREE.Mesh(fillGeo, fillMat);
    this.hpBarFill.position.set(-22.5, 0, 0.1);
    this.hpBarGroup.add(this.hpBarFill);

    this.mesh.add(this.hpBarGroup);
  }

  public pickNewTarget(): void {
    const mode = Math.random();
    if (mode < 0.35) {
      // Central rotunda
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 480;
      this.targetPos.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
    } else if (mode < 0.7) {
      // Outer ring
      const ang = Math.random() * Math.PI * 2;
      const r = 2840 + Math.random() * 340;
      this.targetPos.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    } else {
      // 4 Radial Corridors
      const corridorDist = 700 + Math.random() * 1900;
      const dirChoice = Math.floor(Math.random() * 4);
      if (dirChoice === 0) this.targetPos.set((Math.random() - 0.5) * 140, 0, -corridorDist);
      else if (dirChoice === 1) this.targetPos.set((Math.random() - 0.5) * 140, 0, corridorDist);
      else if (dirChoice === 2) this.targetPos.set(-corridorDist, 0, (Math.random() - 0.5) * 140);
      else this.targetPos.set(corridorDist, 0, (Math.random() - 0.5) * 140);
    }
    this.changeTargetTimer = 3.5 + Math.random() * 5.0;
  }

  public takeDamage(
    amount: number,
    hitDir: THREE.Vector3,
    knockback: number,
    goreLevel: number = 3,
    bloodDuration: number = Infinity
  ): boolean {
    if (!this.isAlive) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.flashTimer = 0.16;

    // Knockback physics
    this.velocity.addScaledVector(hitDir, knockback);
    this.velocity.y = Math.max(this.velocity.y, knockback * 0.35);

    // Dynamic blood spray on impact
    if (this.goreSystem && goreLevel > 0) {
      this.goreSystem.spawnBloodHit(this.position, hitDir, goreLevel, bloodDuration);
    }

    // Update HP bar
    const pct = Math.max(0, this.hp / this.maxHp);
    this.hpBarFill.scale.set(pct, 1, 1);

    if (this.hp <= 0) {
      this.die(hitDir, goreLevel, bloodDuration);
      return true;
    } else {
      // Quick flinch reaction
      const hitAct = this.actions.get('hit');
      if (hitAct && this.currentActionName !== 'hit') {
        hitAct.reset();
        hitAct.play();
      }
    }
    return false;
  }

  public die(hitDir?: THREE.Vector3, goreLevel: number = 3, bloodDuration: number = Infinity): void {
    this.isAlive = false;
    this.respawnTimer = 2.8;
    this.hpBarGroup.visible = false;

    // Brutal Gibbing: Skeleton explodes into flying gory bones & flesh chunks!
    if (this.goreSystem && goreLevel > 0) {
      this.model.visible = false;
      this.goreSystem.spawnGibExplosion(this.position, hitDir, goreLevel, bloodDuration);
    } else {
      // Play death falling animation if gore is off
      this.playAction('death', 0.1);
    }

    soundManager.playBoneShatter();
    soundManager.playBotKill();
  }

  public respawn(spawnPos: THREE.Vector3): void {
    this.isAlive = true;
    this.hp = this.maxHp;
    this.hpBarFill.scale.set(1, 1, 1);
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.mesh.position.copy(this.position);
    this.hpBarGroup.visible = true;
    this.model.visible = true; // Restore skeleton mesh visibility on respawn

    // Resurrect / crawl from ground animation
    if (this.actions.has('spawn')) {
      this.playAction('spawn', 0.1);
    } else {
      this.playAction('idle', 0.2);
    }

    this.pickNewTarget();
  }

  public update(dt: number, bounds: CastleMapBounds | undefined, camera: THREE.Camera): void {
    // Update animation mixer every frame
    if (this.mixer) {
      this.mixer.update(dt);
    }

    if (!this.isAlive) {
      this.respawnTimer -= dt;
      return;
    }

    // Orient health bar towards camera
    this.hpBarGroup.quaternion.copy(camera.quaternion);

    // Damage Flash highlight
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const isFlashing = this.flashTimer > 0;
      for (const m of this.skinnedMeshes) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive) {
          if (isFlashing) {
            mat.emissive.setHex(0xff1122);
            mat.emissiveIntensity = 2.0;
          } else {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
        }
      }
    }

    // 1. Navigation AI
    this.changeTargetTimer -= dt;
    if (this.changeTargetTimer <= 0) {
      this.pickNewTarget();
    }

    const toTarget = new THREE.Vector3().subVectors(this.targetPos, this.position);
    toTarget.y = 0;
    const distToTarget = toTarget.length();
    const isMoving = distToTarget > 60;

    if (isMoving) {
      toTarget.normalize();
      this.velocity.x += (toTarget.x * this.moveSpeed - this.velocity.x) * Math.min(1.0, dt * 5.5);
      this.velocity.z += (toTarget.z * this.moveSpeed - this.velocity.z) * Math.min(1.0, dt * 5.5);

      // Smooth yaw rotation facing travel direction
      const targetYaw = Math.atan2(toTarget.x, toTarget.z);
      let diffYaw = targetYaw - this.mesh.rotation.y;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      this.mesh.rotation.y += diffYaw * Math.min(1.0, dt * 9);
    } else {
      this.pickNewTarget();
    }

    // 2. Bunnyhop / Skeleton charge jump
    this.hopTimer -= dt;
    if (this.hopTimer <= 0 && this.position.y <= 0.1) {
      this.velocity.y = 190 + Math.random() * 80;
      this.hopTimer = 1.6 + Math.random() * 2.6;
    }

    // 3. Gravity & Friction
    if (this.position.y > 0) {
      this.velocity.y -= 620 * dt;
    }
    this.velocity.x *= Math.pow(0.85, dt * 60);
    this.velocity.z *= Math.pow(0.85, dt * 60);

    this.position.addScaledVector(this.velocity, dt);

    if (this.position.y < 0) {
      this.position.y = 0;
      this.velocity.y = 0;
    }

    // 4. Citadel Boundary collision
    if (bounds) {
      this.constrainBounds(bounds);
    }

    this.mesh.position.copy(this.position);

    // 5. Dynamic Animation State Machine
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const inAir = this.position.y > 1.8;

    if (inAir) {
      this.playAction('jump', 0.15);
    } else if (horizSpeed > 90) {
      this.playAction('run', 0.2);
    } else if (horizSpeed > 15) {
      this.playAction('walk', 0.2);
    } else {
      this.playAction('idle', 0.25);
    }
  }

  private constrainBounds(bounds: CastleMapBounds): void {
    const { centerRadius, corridorHalfWidth, ringInnerRadius, ringOuterRadius } = bounds;
    const dist = Math.hypot(this.position.x, this.position.z);
    if (dist < 0.001) return;

    // Grand Outer Circle
    const maxOuter = ringOuterRadius - this.radius;
    if (dist > maxOuter) {
      const pen = dist - maxOuter;
      this.position.x -= (this.position.x / dist) * pen;
      this.position.z -= (this.position.z / dist) * pen;
      this.pickNewTarget();
    }

    const inQuarterBastion = Math.abs(this.position.x) > corridorHalfWidth && Math.abs(this.position.z) > corridorHalfWidth;

    // Outer Ring Inner Wall
    if (inQuarterBastion && dist > (centerRadius + ringInnerRadius) * 0.5) {
      const minRing = ringInnerRadius + this.radius;
      if (dist < minRing) {
        const pen = minRing - dist;
        this.position.x += (this.position.x / dist) * pen;
        this.position.z += (this.position.z / dist) * pen;
        this.pickNewTarget();
      }
    }

    // Central Rotunda Wall
    if (inQuarterBastion && dist < (centerRadius + ringInnerRadius) * 0.5) {
      const maxCenter = centerRadius - this.radius;
      if (dist > maxCenter) {
        const pen = dist - maxCenter;
        this.position.x -= (this.position.x / dist) * pen;
        this.position.z -= (this.position.z / dist) * pen;
        this.pickNewTarget();
      }
    }
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
}

export class BotManager {
  public bots: Bot[] = [];
  private scene: THREE.Scene;
  private bounds?: CastleMapBounds;
  public goreSystem?: GoreSystem;
  public goreLevel = 3;
  public bloodDuration = Infinity;

  // Cached Realistic Skeleton Templates
  private templates: SkeletonTemplate[] = [];
  public isLoaded = false;
  private desiredBotCount = 5;
  public onTemplatesLoaded?: (templates: SkeletonTemplate[]) => void;

  public getTemplates(): SkeletonTemplate[] {
    return this.templates;
  }

  constructor(scene: THREE.Scene, bounds?: CastleMapBounds, goreSystem?: GoreSystem) {
    this.scene = scene;
    this.bounds = bounds;
    this.goreSystem = goreSystem;

    // Load professional 3D skeleton models
    this.loadSkeletonModels();
  }

  public setGoreSettings(level: number, duration: number): void {
    this.goreLevel = level;
    this.bloodDuration = duration;
    for (const b of this.bots) {
      b.goreSystem = this.goreSystem;
    }
  }

  private async loadSkeletonModels(): Promise<void> {
    const loader = new GLTFLoader();
    const baseUrl = import.meta.env.BASE_URL || './';
    const modelUrls = [
      { name: 'Warrior', url: `${baseUrl}models/skeleton_warrior.glb` },
      { name: 'Minion', url: `${baseUrl}models/skeleton_minion.glb` },
      { name: 'Rogue', url: `${baseUrl}models/skeleton_rogue.glb` }
    ];

    try {
      const loadPromises = modelUrls.map(({ name, url }) => {
        return new Promise<SkeletonTemplate>((resolve, reject) => {
          loader.load(
            url,
            (gltf) => {
              resolve({
                name,
                scene: gltf.scene,
                animations: gltf.animations
              });
            },
            undefined,
            (err) => reject(err)
          );
        });
      });

      this.templates = await Promise.all(loadPromises);
      this.isLoaded = true;
      if (this.onTemplatesLoaded) {
        this.onTemplatesLoaded(this.templates);
      }

      // Instantiate desired bots once models are ready
      this.syncBotCount();
    } catch (err) {
      console.warn('Failed to load skeleton GLTF models, will fallback:', err);
    }
  }

  public setBotCount(targetCount: number): void {
    this.desiredBotCount = Math.max(0, Math.min(25, targetCount));
    if (this.isLoaded) {
      this.syncBotCount();
    }
  }

  private syncBotCount(): void {
    if (!this.isLoaded || this.templates.length === 0) return;

    // Remove excess bots
    while (this.bots.length > this.desiredBotCount) {
      const bot = this.bots.pop();
      if (bot) bot.dispose(this.scene);
    }

    // Add new realistic skeletal warriors
    while (this.bots.length < this.desiredBotCount) {
      const spawnPos = this.getRandomSpawnPosition();
      // Pick random skeleton archetype (Warrior with sword & shield, Rogue with hood & daggers, Minion)
      const template = this.templates[Math.floor(Math.random() * this.templates.length)];
      const bot = new Bot(this.scene, spawnPos, template, this.goreSystem);
      this.bots.push(bot);
    }
  }

  public getRandomSpawnPosition(): THREE.Vector3 {
    const choice = Math.random();
    if (choice < 0.4) {
      // Outer ring
      const ang = Math.random() * Math.PI * 2;
      const r = 2850 + Math.random() * 300;
      return new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    } else if (choice < 0.75) {
      // Along one of the 4 corridors
      const dist = 700 + Math.random() * 1800;
      const axis = Math.floor(Math.random() * 4);
      if (axis === 0) return new THREE.Vector3((Math.random() - 0.5) * 120, 0, -dist);
      if (axis === 1) return new THREE.Vector3((Math.random() - 0.5) * 120, 0, dist);
      if (axis === 2) return new THREE.Vector3(-dist, 0, (Math.random() - 0.5) * 120);
      return new THREE.Vector3(dist, 0, (Math.random() - 0.5) * 120);
    } else {
      // Central rotunda
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 400;
      return new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    }
  }

  public update(dt: number, camera: THREE.Camera): void {
    for (const bot of this.bots) {
      if (!bot.isAlive && bot.respawnTimer <= 0) {
        bot.respawn(this.getRandomSpawnPosition());
      }
      bot.update(dt, this.bounds, camera);
    }
  }

  // Hitscan ray test (for shotgun pellets)
  public checkRayHit(
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3,
    maxDist: number,
    damagePerPellet: number,
    knockback: number
  ): BotDamageResult {
    let closestDist = maxDist;
    let closestBot: Bot | null = null;

    for (const bot of this.bots) {
      if (!bot.isAlive) continue;

      const botCenter = bot.position.clone();
      botCenter.y += bot.height * 0.5;

      const toBot = botCenter.clone().sub(rayOrigin);
      const proj = toBot.dot(rayDir);
      if (proj <= 0 || proj > closestDist) continue;

      const closestPointOnRay = rayOrigin.clone().addScaledVector(rayDir, proj);
      const distToRay = closestPointOnRay.distanceTo(botCenter);

      if (distToRay <= bot.radius + 6) {
        if (proj < closestDist) {
          closestDist = proj;
          closestBot = bot;
        }
      }
    }

    if (closestBot) {
      const killed = closestBot.takeDamage(damagePerPellet, rayDir, knockback, this.goreLevel, this.bloodDuration);
      const hitPoint = rayOrigin.clone().addScaledVector(rayDir, closestDist);
      return { hit: true, bot: closestBot, killed, damage: damagePerPellet, hitPoint, distance: closestDist };
    }

    return { hit: false, killed: false, damage: 0 };
  }

  // Radial Splash damage test (for rocket explosions)
  public checkExplosion(
    origin: THREE.Vector3,
    radius: number,
    maxDamage: number,
    knockbackForce: number
  ): { hits: number; kills: number } {
    let hits = 0;
    let kills = 0;

    for (const bot of this.bots) {
      if (!bot.isAlive) continue;

      const botCenter = bot.position.clone();
      botCenter.y += bot.height * 0.5;
      const diff = botCenter.clone().sub(origin);
      const dist = diff.length();

      if (dist < radius) {
        hits++;
        const factor = Math.max(0.2, 1.0 - (dist / radius));
        const dmg = Math.round(maxDamage * factor);
        diff.y += 15;
        if (diff.lengthSq() < 0.001) diff.set(0, 1, 0);
        else diff.normalize();

        const killed = bot.takeDamage(dmg, diff, knockbackForce * factor, this.goreLevel, this.bloodDuration);
        if (killed) kills++;
      }
    }

    return { hits, kills };
  }
}
