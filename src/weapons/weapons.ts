import * as THREE from 'three';
import { soundManager } from '../audio/synth';
import type { WeaponType } from '../types';
import type { BotManager } from '../entities/botManager';
import type { Pmove } from '../physics/pmove';
import { ExplosionFXManager } from './explosionFX';

export interface WeaponCallbacks {
  onHitmarker?: () => void;
  onFrag?: () => void;
  onWeaponChange?: (weapon: WeaponType) => void;
}

export interface Rocket {
  mesh: THREE.Group;
  flameCore: THREE.Mesh;
  flameOuter: THREE.Mesh;
  light: THREE.PointLight;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  trailTimer: number;
}

export interface TracerFX {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

export interface RailBeamFX {
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  innerMesh: THREE.Mesh;
  spiralMesh: THREE.Line;
  impactMesh?: THREE.Mesh;
  impactLight?: THREE.PointLight;
  life: number;
  maxLife: number;
}

export class WeaponManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private botManager: BotManager;
  private pmove: Pmove;
  private callbacks: WeaponCallbacks;

  // Visual FX & Particle Manager
  private explosionFX: ExplosionFXManager;

  // Viewmodel groups
  public viewmodelRoot: THREE.Group;
  private shotgunModel!: THREE.Group;
  private rocketModel!: THREE.Group;
  private railgunModel!: THREE.Group;
  private muzzleFlash!: THREE.PointLight;
  private muzzleFlashMesh!: THREE.Mesh;

  // Current Weapon state
  public currentWeapon: WeaponType = 'shotgun';
  private fireCooldown = 0;
  private recoilOffset = 0;
  private recoilPitch = 0;
  private bobTime = 0;

  // Active Projectiles & FX
  private activeRockets: Rocket[] = [];
  private activeTracers: TracerFX[] = [];
  private activeRailBeams: RailBeamFX[] = [];

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    botManager: BotManager,
    pmove: Pmove,
    callbacks: WeaponCallbacks = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.botManager = botManager;
    this.pmove = pmove;
    this.callbacks = callbacks;

    this.explosionFX = new ExplosionFXManager(scene);

    this.viewmodelRoot = new THREE.Group();
    this.camera.add(this.viewmodelRoot);

    this.buildViewmodels();
    this.switchWeapon('shotgun', false);
  }

  private buildViewmodels(): void {
    // ----------------------------------------
    // 1. Procedural Double-Barreled Shotgun
    // ----------------------------------------
    this.shotgunModel = new THREE.Group();

    // Receiver (dark matte gunmetal)
    const recGeo = new THREE.BoxGeometry(3.6, 5.0, 14.0);
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      metalness: 0.85,
      roughness: 0.25
    });
    const receiver = new THREE.Mesh(recGeo, metalMat);
    receiver.position.set(0, 0, -7.0);
    this.shotgunModel.add(receiver);

    // Glowing Cyber Accent Strip
    const stripGeo = new THREE.BoxGeometry(3.8, 0.8, 10.0);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(0, 2.2, -7.0);
    this.shotgunModel.add(strip);

    // Twin Heavy Barrels
    const barrelGeo = new THREE.CylinderGeometry(1.4, 1.4, 18.0, 16);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x2b313d,
      metalness: 0.95,
      roughness: 0.15
    });
    const leftBarrel = new THREE.Mesh(barrelGeo, barrelMat);
    leftBarrel.position.set(-1.1, 1.2, -22.0);
    this.shotgunModel.add(leftBarrel);

    const rightBarrel = new THREE.Mesh(barrelGeo, barrelMat);
    rightBarrel.position.set(1.1, 1.2, -22.0);
    this.shotgunModel.add(rightBarrel);

    // Pump grip forend (orange accented)
    const pumpGeo = new THREE.BoxGeometry(3.8, 3.2, 8.0);
    const pumpMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.4,
      metalness: 0.5
    });
    const pump = new THREE.Mesh(pumpGeo, pumpMat);
    pump.position.set(0, -0.6, -18.0);
    this.shotgunModel.add(pump);

    // Stock & Grip
    const gripGeo = new THREE.BoxGeometry(2.6, 7.0, 4.0);
    gripGeo.rotateX(-0.35);
    const grip = new THREE.Mesh(gripGeo, metalMat);
    grip.position.set(0, -3.8, -2.5);
    this.shotgunModel.add(grip);

    // Position in first-person view
    this.shotgunModel.position.set(6.5, -6.5, -12.0);
    this.viewmodelRoot.add(this.shotgunModel);

    // ----------------------------------------
    // 2. Realistic Heavy Industrial Rocket Launcher
    // ----------------------------------------
    this.rocketModel = new THREE.Group();

    // Materials
    const darkTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x14181f,
      metalness: 0.9,
      roughness: 0.22
    });
    const gunmetalMat = new THREE.MeshStandardMaterial({
      color: 0x222834,
      metalness: 0.85,
      roughness: 0.35
    });
    const industrialOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xdd5511,
      metalness: 0.65,
      roughness: 0.3
    });
    const hazardYellowMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.5,
      roughness: 0.35
    });
    const carbonInnerMat = new THREE.MeshBasicMaterial({
      color: 0x05070a
    });
    const amberGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4400,
      emissiveIntensity: 1.8,
      metalness: 0.2
    });

    // A. Main Armored Barrel Housing (Hexagonal faceted titanium chassis)
    const shroudGeo = new THREE.CylinderGeometry(4.4, 4.8, 30.0, 6);
    shroudGeo.rotateX(Math.PI / 2);
    const shroudMesh = new THREE.Mesh(shroudGeo, darkTitaniumMat);
    shroudMesh.position.set(0, 0, -16.0);
    this.rocketModel.add(shroudMesh);

    // B. Internal Bore Cylinder (Deep black cavity)
    const boreGeo = new THREE.CylinderGeometry(3.2, 3.2, 33.0, 18, 1, true);
    boreGeo.rotateX(Math.PI / 2);
    const boreMesh = new THREE.Mesh(boreGeo, carbonInnerMat);
    boreMesh.position.set(0, 0, -17.0);
    this.rocketModel.add(boreMesh);

    // C. Heavy Flanged Muzzle Brake with gas expansion ports
    const muzzleGeo = new THREE.CylinderGeometry(5.2, 4.4, 5.0, 12);
    muzzleGeo.rotateX(Math.PI / 2);
    const muzzleMesh = new THREE.Mesh(muzzleGeo, gunmetalMat);
    muzzleMesh.position.set(0, 0, -32.5);
    this.rocketModel.add(muzzleMesh);

    // Front reinforcement collar (Hazard orange ring)
    const collarGeo = new THREE.TorusGeometry(4.7, 0.45, 8, 20);
    const collarMesh = new THREE.Mesh(collarGeo, industrialOrangeMat);
    collarMesh.position.set(0, 0, -30.0);
    this.rocketModel.add(collarMesh);

    // D. Loaded Rocket Warhead (Visible inside launch tube!)
    const chamberedRocket = new THREE.Group();
    const warheadGeo = new THREE.ConeGeometry(2.3, 5.5, 14);
    warheadGeo.rotateX(Math.PI / 2);
    const warheadMesh = new THREE.Mesh(warheadGeo, industrialOrangeMat);
    chamberedRocket.add(warheadMesh);

    const fuseTipGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8);
    fuseTipGeo.rotateX(Math.PI / 2);
    const fuseTipMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9 });
    const fuseTip = new THREE.Mesh(fuseTipGeo, fuseTipMat);
    fuseTip.position.set(0, 0, -3.2);
    chamberedRocket.add(fuseTip);

    chamberedRocket.position.set(0, 0, -26.0);
    this.rocketModel.add(chamberedRocket);

    // E. Quad Revolver Rocket Magazines / Ammo Battery (Side Chambers)
    const quadDrum = new THREE.Group();
    const drumPositions = [
      { x: 3.8, y: 1.8 },
      { x: -3.8, y: 1.8 },
      { x: 3.4, y: -2.0 },
      { x: -3.4, y: -2.0 }
    ];

    drumPositions.forEach((dp, idx) => {
      const subTubeGeo = new THREE.CylinderGeometry(1.6, 1.6, 18.0, 12);
      subTubeGeo.rotateX(Math.PI / 2);
      const subTube = new THREE.Mesh(subTubeGeo, gunmetalMat);
      subTube.position.set(dp.x, dp.y, -14.0);
      quadDrum.add(subTube);

      // Warning hazard stripe on front cap
      const capGeo = new THREE.CylinderGeometry(1.7, 1.7, 1.2, 12);
      capGeo.rotateX(Math.PI / 2);
      const cap = new THREE.Mesh(capGeo, idx % 2 === 0 ? hazardYellowMat : industrialOrangeMat);
      cap.position.set(dp.x, dp.y, -23.5);
      quadDrum.add(cap);
    });
    this.rocketModel.add(quadDrum);

    // F. Top Picatinny Rail & Holographic Targeting Sight
    const railGeo = new THREE.BoxGeometry(2.4, 1.0, 22.0);
    const railMesh = new THREE.Mesh(railGeo, darkTitaniumMat);
    railMesh.position.set(0, 4.8, -15.0);
    this.rocketModel.add(railMesh);

    // Sight housing
    const sightBoxGeo = new THREE.BoxGeometry(3.6, 3.8, 6.0);
    const sightBox = new THREE.Mesh(sightBoxGeo, gunmetalMat);
    sightBox.position.set(0, 7.0, -18.0);
    this.rocketModel.add(sightBox);

    // Holographic Reticle Lens
    const lensGeo = new THREE.PlaneGeometry(2.8, 2.8);
    const lensMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, 7.0, -21.1);
    this.rocketModel.add(lens);

    // Glowing Amber Target Ring in Lens
    const reticleGeo = new THREE.RingGeometry(0.5, 0.7, 16);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      side: THREE.DoubleSide
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.position.set(0, 7.0, -21.05);
    this.rocketModel.add(reticle);

    // G. Side Cooling Heat Sinks (Glowing Amber Vents)
    const ventGeo = new THREE.BoxGeometry(0.6, 2.0, 12.0);
    const leftVent = new THREE.Mesh(ventGeo, amberGlowMat);
    leftVent.position.set(-4.5, 0, -15.0);
    this.rocketModel.add(leftVent);

    const rightVent = new THREE.Mesh(ventGeo, amberGlowMat);
    rightVent.position.set(4.5, 0, -15.0);
    this.rocketModel.add(rightVent);

    // H. Ergonomic Foregrip & Pistol Grip with Trigger Guard
    // Foregrip
    const foregripGeo = new THREE.BoxGeometry(2.2, 7.5, 3.2);
    foregripGeo.rotateX(0.25);
    const foregrip = new THREE.Mesh(foregripGeo, darkTitaniumMat);
    foregrip.position.set(0, -6.5, -20.0);
    this.rocketModel.add(foregrip);

    // Rear Grip & Trigger Guard
    const gripGeo2 = new THREE.BoxGeometry(2.4, 9.0, 3.8);
    gripGeo2.rotateX(-0.35);
    const grip2 = new THREE.Mesh(gripGeo2, darkTitaniumMat);
    grip2.position.set(0, -5.8, -5.5);
    this.rocketModel.add(grip2);

    // Trigger Guard loop
    const guardGeo = new THREE.TorusGeometry(1.6, 0.35, 6, 12);
    const guard = new THREE.Mesh(guardGeo, gunmetalMat);
    guard.position.set(0, -3.8, -7.5);
    this.rocketModel.add(guard);

    // I. Rear Backblast Exhaust Vent Nozzle (Heavy conical cone behind shooter)
    const backblastGeo = new THREE.CylinderGeometry(4.8, 3.8, 6.0, 16);
    backblastGeo.rotateX(Math.PI / 2);
    const backblast = new THREE.Mesh(backblastGeo, gunmetalMat);
    backblast.position.set(0, 0, 1.5);
    this.rocketModel.add(backblast);

    // Position in first-person view
    this.rocketModel.position.set(7.5, -7.2, -13.0);
    this.viewmodelRoot.add(this.rocketModel);

    // ----------------------------------------
    // 3. Iconic CPMA High-Tech Railgun Viewmodel
    // ----------------------------------------
    this.railgunModel = new THREE.Group();

    const railTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x111622,
      metalness: 0.92,
      roughness: 0.22
    });
    const railSteelMat = new THREE.MeshStandardMaterial({
      color: 0x222a38,
      metalness: 0.88,
      roughness: 0.28
    });
    const railGlowCyanMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00f0ff,
      emissiveIntensity: 2.2,
      roughness: 0.1
    });
    const railGlowPinkMat = new THREE.MeshStandardMaterial({
      color: 0xff00cc,
      emissive: 0xd946ef,
      emissiveIntensity: 1.8,
      roughness: 0.2
    });

    // A. Main Body / Heavy Prismatic Receiver
    const bodyGeo = new THREE.BoxGeometry(4.2, 5.0, 22.0);
    const bodyMesh = new THREE.Mesh(bodyGeo, railTitaniumMat);
    bodyMesh.position.set(0, 0, -11.0);
    this.railgunModel.add(bodyMesh);

    // B. Twin High-Voltage Acceleration Rails (Top & Bottom magnetic guides)
    const railGuideGeo = new THREE.BoxGeometry(2.4, 1.4, 30.0);
    const topRail = new THREE.Mesh(railGuideGeo, railSteelMat);
    topRail.position.set(0, 2.6, -24.0);
    this.railgunModel.add(topRail);

    const bottomRail = new THREE.Mesh(railGuideGeo, railSteelMat);
    bottomRail.position.set(0, -2.6, -24.0);
    this.railgunModel.add(bottomRail);

    // C. Glowing Central Plasma Accelerator Channel (Between the rails)
    const coreChannelGeo = new THREE.CylinderGeometry(0.8, 0.8, 28.0, 12);
    coreChannelGeo.rotateX(Math.PI / 2);
    const coreChannel = new THREE.Mesh(coreChannelGeo, railGlowCyanMat);
    coreChannel.position.set(0, 0, -24.0);
    this.railgunModel.add(coreChannel);

    // D. 4 Solenoid Accelerator Coils / Capacitor Rings along the barrel
    const coilZPositions = [-16.0, -22.0, -28.0, -34.0];
    coilZPositions.forEach((cz, idx) => {
      const ringGeo = new THREE.TorusGeometry(2.8, 0.42, 8, 16);
      const ringMesh = new THREE.Mesh(ringGeo, idx % 2 === 0 ? railGlowCyanMat : railGlowPinkMat);
      ringMesh.position.set(0, 0, cz);
      this.railgunModel.add(ringMesh);

      // Support brackets for coils
      const bracketGeo = new THREE.BoxGeometry(3.6, 6.2, 0.9);
      const bracketMesh = new THREE.Mesh(bracketGeo, railTitaniumMat);
      bracketMesh.position.set(0, 0, cz);
      this.railgunModel.add(bracketMesh);
    });

    // E. Heavy Muzzle Nozzle Collar
    const nozzleCollarGeo = new THREE.BoxGeometry(3.8, 6.8, 2.2);
    const nozzleCollar = new THREE.Mesh(nozzleCollarGeo, railSteelMat);
    nozzleCollar.position.set(0, 0, -38.0);
    this.railgunModel.add(nozzleCollar);

    // F. Top Holographic Railgun Scope
    const scopeMountGeo = new THREE.BoxGeometry(2.0, 1.6, 12.0);
    const scopeMount = new THREE.Mesh(scopeMountGeo, railTitaniumMat);
    scopeMount.position.set(0, 3.2, -10.0);
    this.railgunModel.add(scopeMount);

    const scopeLensGeo = new THREE.RingGeometry(0.4, 0.8, 16);
    const scopeLensMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    const scopeLens = new THREE.Mesh(scopeLensGeo, scopeLensMat);
    scopeLens.position.set(0, 4.4, -16.0);
    this.railgunModel.add(scopeLens);

    // Crosshair dot in scope
    const dotGeo = new THREE.CircleGeometry(0.2, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(0, 4.4, -15.98);
    this.railgunModel.add(dot);

    // G. Rear High-Capacity Battery Pack & Cooling Vents
    const batteryGeo = new THREE.BoxGeometry(3.8, 4.4, 6.0);
    const battery = new THREE.Mesh(batteryGeo, railSteelMat);
    battery.position.set(0, -0.4, 1.5);
    this.railgunModel.add(battery);

    // Glowing Charge Indicator Bars on battery
    for (let b = 0; b < 3; b++) {
      const barGeo = new THREE.BoxGeometry(0.4, 1.2, 0.8);
      const barMesh = new THREE.Mesh(barGeo, railGlowCyanMat);
      barMesh.position.set(-2.0, 0.4 - b * 0.8, 1.0);
      this.railgunModel.add(barMesh);
    }

    // H. Ergonomic Grip
    const railGripGeo = new THREE.BoxGeometry(2.2, 7.5, 3.4);
    railGripGeo.rotateX(-0.35);
    const railGrip = new THREE.Mesh(railGripGeo, railTitaniumMat);
    railGrip.position.set(0, -5.2, -4.5);
    this.railgunModel.add(railGrip);

    // Position in first-person view
    this.railgunModel.position.set(6.8, -6.6, -12.5);
    this.viewmodelRoot.add(this.railgunModel);

    // ----------------------------------------
    // 4. Muzzle Flash (Shared Dynamic Light & Fire Sparks)
    // ----------------------------------------
    this.muzzleFlash = new THREE.PointLight(0xff7711, 0, 220);
    this.muzzleFlash.position.set(6.5, -5.5, -38.0);
    this.viewmodelRoot.add(this.muzzleFlash);

    // Layered fiery muzzle blast mesh
    const flashGroup = new THREE.Group();
    const coreFlashGeo = new THREE.OctahedronGeometry(3.6, 0);
    const coreFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coreMesh = new THREE.Mesh(coreFlashGeo, coreFlashMat);
    flashGroup.add(coreMesh);

    const outerFlashGeo = new THREE.DodecahedronGeometry(5.2, 0);
    const outerFlashMat = new THREE.MeshBasicMaterial({ color: 0xff6600, wireframe: false });
    const outerMesh = new THREE.Mesh(outerFlashGeo, outerFlashMat);
    flashGroup.add(outerMesh);

    this.muzzleFlashMesh = flashGroup as unknown as THREE.Mesh;
    this.muzzleFlashMesh.visible = false;
    this.muzzleFlashMesh.position.set(7.5, -6.8, -45.0);
    this.viewmodelRoot.add(this.muzzleFlashMesh);
  }

  public switchWeapon(type: WeaponType, playSound = true): void {
    if (this.currentWeapon === type && playSound) return;
    this.currentWeapon = type;

    this.shotgunModel.visible = (type === 'shotgun');
    this.rocketModel.visible = (type === 'rocket');
    this.railgunModel.visible = (type === 'railgun');

    if (playSound) {
      soundManager.playWeaponSwitch();
    }
    this.callbacks.onWeaponChange?.(this.currentWeapon);
  }

  public toggleWeapon(): void {
    const cycle: WeaponType[] = ['shotgun', 'rocket', 'railgun'];
    const nextIdx = (cycle.indexOf(this.currentWeapon) + 1) % cycle.length;
    this.switchWeapon(cycle[nextIdx]);
  }

  public shoot(): void {
    if (this.fireCooldown > 0) return;

    if (this.currentWeapon === 'shotgun') {
      this.shootShotgun();
      this.fireCooldown = 0.82;
      this.recoilOffset = 4.2;
      this.recoilPitch = 0.08;
    } else if (this.currentWeapon === 'rocket') {
      this.shootRocket();
      this.fireCooldown = 0.78;
      this.recoilOffset = 6.4;
      this.recoilPitch = 0.15;
    } else {
      this.shootRailgun();
      this.fireCooldown = 1.45;
      this.recoilOffset = 8.0;
      this.recoilPitch = 0.18;
    }

    // Trigger Muzzle Flash
    this.triggerMuzzleFlash();
  }

  private triggerMuzzleFlash(): void {
    this.muzzleFlash.intensity = 9.0;
    this.muzzleFlashMesh.visible = true;
    setTimeout(() => {
      this.muzzleFlash.intensity = 0;
      this.muzzleFlashMesh.visible = false;
    }, 65);
  }

  // ----------------------------------------------------
  // SHOTGUN: 12 Hitscan Pellets with Cone Spread
  // ----------------------------------------------------
  private shootShotgun(): void {
    soundManager.playShotgun();

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);

    const pelletCount = 12;
    const spreadAngle = 0.046;
    const maxDist = 3500;
    const damagePerPellet = 10;
    const knockback = 45;

    let anyHit = false;
    let anyKill = false;

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    for (let i = 0; i < pelletCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spreadAngle;
      const rayDir = camDir.clone()
        .addScaledVector(right, Math.cos(ang) * r)
        .addScaledVector(up, Math.sin(ang) * r)
        .normalize();

      const res = this.botManager.checkRayHit(camPos, rayDir, maxDist, damagePerPellet, knockback);
      if (res.hit) {
        anyHit = true;
        if (res.killed) anyKill = true;
      }

      const tracerEnd = camPos.clone().addScaledVector(rayDir, res.hit ? 400 : 900);
      this.createTracer(camPos, tracerEnd, 0x00f0ff);
    }

    if (anyHit) {
      soundManager.playHitSound();
      this.callbacks.onHitmarker?.();
    }
    if (anyKill) {
      this.callbacks.onFrag?.();
    }
  }

  // ----------------------------------------------------
  // ROCKET LAUNCHER: Detailed Rocket Projectile with Dynamic Flame & Trail
  // ----------------------------------------------------
  private shootRocket(): void {
    soundManager.playRocketFire();

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);

    // Build Realistic 3D Rocket Model
    const rocketMesh = new THREE.Group();

    // 1. Aerodynamic Titanium Ogive Nosecone
    const noseGeo = new THREE.ConeGeometry(2.0, 5.0, 16);
    noseGeo.rotateX(Math.PI / 2);
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0x242b35,
      metalness: 0.9,
      roughness: 0.2
    });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 0, -8.5);
    rocketMesh.add(nose);

    // Detonator Pin
    const pinGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.6, 8);
    pinGeo.rotateX(Math.PI / 2);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.95 });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(0, 0, -11.5);
    rocketMesh.add(pin);

    // 2. High-Explosive Warhead Section with Hazard Ring
    const warheadGeo = new THREE.CylinderGeometry(2.0, 2.0, 4.0, 16);
    warheadGeo.rotateX(Math.PI / 2);
    const warheadMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.4,
      roughness: 0.4
    });
    const warhead = new THREE.Mesh(warheadGeo, warheadMat);
    warhead.position.set(0, 0, -4.5);
    rocketMesh.add(warhead);

    // 3. Rocket Motor Body (Military Olive Titanium)
    const bodyGeo = new THREE.CylinderGeometry(2.0, 2.0, 10.0, 16);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      metalness: 0.8,
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, 2.0);
    rocketMesh.add(body);

    // 4. Aerodynamic X-Fins (4 swept tail fins)
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.9,
      roughness: 0.25
    });
    for (let i = 0; i < 4; i++) {
      const finGeo = new THREE.BoxGeometry(0.2, 3.4, 4.5);
      const fin = new THREE.Mesh(finGeo, finMat);
      const ang = (i * Math.PI) / 2;
      fin.position.set(Math.cos(ang) * 2.4, Math.sin(ang) * 2.4, 4.5);
      fin.rotation.z = ang;
      rocketMesh.add(fin);
    }

    // 5. Motor Exhaust Laval Nozzle (Glowing with inner heat)
    const nozzleGeo = new THREE.CylinderGeometry(2.1, 1.4, 2.5, 16);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      emissive: 0xff3300,
      emissiveIntensity: 1.5,
      metalness: 0.9
    });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(0, 0, 7.8);
    rocketMesh.add(nozzle);

    // 6. Volumetric Dual Flame Plume (Inner Plasma Core + Outer Fire Plume)
    // Inner brilliant white-hot core
    const coreFlameGeo = new THREE.ConeGeometry(0.85, 6.0, 10);
    coreFlameGeo.rotateX(-Math.PI / 2); // points backward along +Z
    const coreFlameMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    const flameCore = new THREE.Mesh(coreFlameGeo, coreFlameMat);
    flameCore.position.set(0, 0, 11.5);
    rocketMesh.add(flameCore);

    // Outer roaring orange-yellow flame cone
    const outerFlameGeo = new THREE.ConeGeometry(1.6, 12.0, 12);
    outerFlameGeo.rotateX(-Math.PI / 2);
    const outerFlameMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const flameOuter = new THREE.Mesh(outerFlameGeo, outerFlameMat);
    flameOuter.position.set(0, 0, 14.5);
    rocketMesh.add(flameOuter);

    // Dynamic Rocket Thruster Point Light
    const rocketLight = new THREE.PointLight(0xff6600, 4.5, 130);
    rocketLight.position.set(0, 0, 8.5);
    rocketMesh.add(rocketLight);

    // Align rotation with camera direction
    rocketMesh.quaternion.copy(this.camera.quaternion);

    // Spawn slightly forward from camera view
    const spawnPos = camPos.clone().addScaledVector(camDir, 28);
    rocketMesh.position.copy(spawnPos);
    this.scene.add(rocketMesh);

    const speed = 1520;
    const velocity = camDir.clone().multiplyScalar(speed);

    this.activeRockets.push({
      mesh: rocketMesh,
      flameCore,
      flameOuter,
      light: rocketLight,
      position: spawnPos,
      velocity,
      life: 5.0,
      trailTimer: 0
    });
  }

  // ----------------------------------------------------
  // RAILGUN: Instant Hitscan Deathray (150 Dmg ONE-SHOT) with Quake Spiral FX
  // ----------------------------------------------------
  private shootRailgun(): void {
    soundManager.playRailgunFire();

    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.camera.getWorldDirection(camDir);

    const maxDist = 7500;
    const railDamage = 150; // Guaranteed ONE-SHOT kill against 100 HP skeleton bots!
    const knockback = 580;

    const res = this.botManager.checkRayHit(camPos, camDir, maxDist, railDamage, knockback);

    let endPoint: THREE.Vector3;
    if (res.hit && res.hitPoint) {
      endPoint = res.hitPoint;
      soundManager.playHitSound();
      this.callbacks.onHitmarker?.();
      if (res.killed) {
        this.callbacks.onFrag?.();
      }
    } else {
      // Raycast towards world boundary
      endPoint = camPos.clone().addScaledVector(camDir, 4500);
      if (endPoint.y < 0 && camDir.y < -0.001) {
        const t = -camPos.y / camDir.y;
        if (t > 0 && t < 4500) {
          endPoint = camPos.clone().addScaledVector(camDir, t);
        }
      }
    }

    // Spawn the legendary Quake 3 / CPMA Railgun Spiral & Core Beam FX
    this.createRailgunBeam(camPos, endPoint, res.hit);
  }

  // Create the iconic Quake 3 Arena / CPMA Railgun Trail:
  // 1. Intense glowing cyan/white laser core beam
  // 2. High-speed magenta/violet corkscrew spiral helix wrapping around the core
  // 3. Dynamic plasma flare and impact flash at hit point
  private createRailgunBeam(start: THREE.Vector3, end: THREE.Vector3, isDirectHit: boolean): void {
    const beamGroup = new THREE.Group();

    const dir = end.clone().sub(start);
    const length = dir.length();
    if (length < 1) return;
    const normDir = dir.clone().normalize();
    const midPoint = start.clone().add(end).multiplyScalar(0.5);

    // 1. Central Core Laser Cylinder (Brilliant neon cyan with white center)
    const coreGeo = new THREE.CylinderGeometry(0.9, 0.9, length, 8);
    coreGeo.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.copy(midPoint);
    coreMesh.lookAt(end);
    beamGroup.add(coreMesh);

    // Inner white-hot laser core
    const innerGeo = new THREE.CylinderGeometry(0.35, 0.35, length, 6);
    innerGeo.rotateX(Math.PI / 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.copy(midPoint);
    innerMesh.lookAt(end);
    beamGroup.add(innerMesh);

    // 2. The Legendary CPMA Corkscrew Helix (Spiral wrapping around the beam)
    // Compute perpendicular coordinate basis (u, v) for the spiral
    const arbitrary = Math.abs(normDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(normDir, arbitrary).normalize();
    const v = new THREE.Vector3().crossVectors(normDir, u).normalize();

    const spiralPoints: THREE.Vector3[] = [];
    const stepDist = 3.5; // step size in units
    const spiralRadius = 3.2; // radius of corkscrew
    const spiralPitch = 28.0; // length of one complete 360-deg rotation

    for (let s = 0; s <= length; s += stepDist) {
      const angle = (s / spiralPitch) * Math.PI * 2;
      const pt = start.clone()
        .addScaledVector(normDir, s)
        .addScaledVector(u, Math.cos(angle) * spiralRadius)
        .addScaledVector(v, Math.sin(angle) * spiralRadius);
      spiralPoints.push(pt);
    }

    const spiralGeo = new THREE.BufferGeometry().setFromPoints(spiralPoints);
    const spiralMat = new THREE.LineBasicMaterial({
      color: 0xd946ef, // CPMA iconic vibrant magenta spiral!
      transparent: true,
      opacity: 0.95,
      linewidth: 2,
      blending: THREE.AdditiveBlending
    });
    const spiralMesh = new THREE.Line(spiralGeo, spiralMat);
    beamGroup.add(spiralMesh);

    // 3. Impact Plasma Flare at End Point
    let impactMesh: THREE.Mesh | undefined;
    let impactLight: THREE.PointLight | undefined;

    const flareGeo = new THREE.SphereGeometry(isDirectHit ? 6.0 : 4.0, 8, 8);
    const flareMat = new THREE.MeshBasicMaterial({
      color: isDirectHit ? 0x00ffff : 0xd946ef,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    impactMesh = new THREE.Mesh(flareGeo, flareMat);
    impactMesh.position.copy(end);
    beamGroup.add(impactMesh);

    impactLight = new THREE.PointLight(0x00f0ff, 5.5, 180);
    impactLight.position.copy(end);
    beamGroup.add(impactLight);

    this.scene.add(beamGroup);

    this.activeRailBeams.push({
      group: beamGroup,
      coreMesh,
      innerMesh,
      spiralMesh,
      impactMesh,
      impactLight,
      life: 1.25,
      maxLife: 1.25
    });
  }

  // Update rockets, explosions, viewmodel animation
  public update(dt: number, speed: number): void {
    // 1. Fire Cooldown
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }

    // 2. Viewmodel Bobbing & Spring Recoil
    this.bobTime += dt * Math.min(18, Math.max(4, speed * 0.035));
    const isMoving = speed > 30;
    const bobX = isMoving ? Math.cos(this.bobTime * 0.5) * 0.45 : 0;
    const bobY = isMoving ? Math.sin(this.bobTime) * 0.45 : 0;

    // Recoil recovery
    this.recoilOffset += (0 - this.recoilOffset) * Math.min(1.0, dt * 14);
    this.recoilPitch += (0 - this.recoilPitch) * Math.min(1.0, dt * 14);

    if (this.currentWeapon === 'shotgun') {
      this.shotgunModel.position.set(6.5 + bobX, -6.5 + bobY, -12.0 + this.recoilOffset);
      this.shotgunModel.rotation.x = this.recoilPitch;
    } else if (this.currentWeapon === 'rocket') {
      this.rocketModel.position.set(7.5 + bobX, -7.2 + bobY, -13.0 + this.recoilOffset);
      this.rocketModel.rotation.x = this.recoilPitch;
    } else {
      this.railgunModel.position.set(6.8 + bobX, -6.6 + bobY, -12.5 + this.recoilOffset);
      this.railgunModel.rotation.x = this.recoilPitch;
    }

    // 3. Update Active Rockets & Continuous Smoke/Fire Trails
    const nowTime = performance.now() * 0.001;

    for (let i = this.activeRockets.length - 1; i >= 0; i--) {
      const r = this.activeRockets[i];
      r.life -= dt;
      r.trailTimer -= dt;

      // Rocket stabilization roll spin & thruster pulsation
      r.mesh.rotateZ(dt * 32.0);
      const flamePulse = 1.0 + Math.sin(nowTime * 55.0) * 0.22;
      r.flameCore.scale.set(flamePulse, flamePulse, flamePulse);
      r.flameOuter.scale.set(flamePulse * 1.1, flamePulse * 1.1, 1.0 + Math.sin(nowTime * 70.0) * 0.3);

      // Advance position
      r.position.addScaledVector(r.velocity, dt);
      r.mesh.position.copy(r.position);

      // Emit realistic dense smoke trail and hot sparks behind rocket nozzle
      if (r.trailTimer <= 0) {
        const flightDir = r.velocity.clone().normalize();
        const nozzlePos = r.position.clone().addScaledVector(flightDir, -10.0);

        this.explosionFX.spawnRocketTrailPuff(nozzlePos, flightDir);
        if (Math.random() > 0.4) {
          this.explosionFX.spawnRocketThrusterSpark(nozzlePos, flightDir);
        }
        r.trailTimer = 0.022; // ~45 smoke puffs per second for continuous cloud trail
      }

      // Check collision against ground (y <= 0)
      let hit = false;
      let hitPoint = r.position.clone();

      if (r.position.y <= 0) {
        hit = true;
        hitPoint.y = 0;
      }

      // Check collision against castle walls/outer boundaries
      const dist = Math.hypot(r.position.x, r.position.z);
      if (dist >= 3240) {
        hit = true;
      }

      // Check collision with giant skeleton bots
      for (const bot of this.botManager.bots) {
        if (!bot.isAlive) continue;
        const botCenter = bot.position.clone();
        botCenter.y += bot.height * 0.5;
        if (r.position.distanceTo(botCenter) < bot.radius + 10) {
          hit = true;
          hitPoint.copy(botCenter);
          break;
        }
      }

      if (hit || r.life <= 0) {
        // Trigger realistic explosion and clean up projectile
        this.createExplosion(hitPoint);
        this.scene.remove(r.mesh);
        this.activeRockets.splice(i, 1);
      }
    }

    // 4. Update Particle Explosion FX
    this.explosionFX.update(dt);

    // 5. Update Tracers
    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const tr = this.activeTracers[i];
      tr.life -= dt;
      const mat = tr.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, tr.life / tr.maxLife);
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        this.activeTracers.splice(i, 1);
      }
    }

    // 6. Update Active Quake Railgun Beams & Corkscrew Spirals
    for (let i = this.activeRailBeams.length - 1; i >= 0; i--) {
      const rb = this.activeRailBeams[i];
      rb.life -= dt;
      const progress = Math.max(0, rb.life / rb.maxLife);
      const alpha = Math.pow(progress, 1.25);

      (rb.coreMesh.material as THREE.MeshBasicMaterial).opacity = alpha * 0.95;
      (rb.innerMesh.material as THREE.MeshBasicMaterial).opacity = alpha * 0.95;
      (rb.spiralMesh.material as THREE.LineBasicMaterial).opacity = alpha * 0.95;

      if (rb.impactMesh) {
        (rb.impactMesh.material as THREE.MeshBasicMaterial).opacity = Math.pow(progress, 2.0);
        rb.impactMesh.scale.setScalar(1.0 + (1.0 - progress) * 1.6);
      }
      if (rb.impactLight) {
        rb.impactLight.intensity = Math.pow(progress, 2.5) * 5.5;
      }

      if (rb.life <= 0) {
        this.scene.remove(rb.group);
        this.activeRailBeams.splice(i, 1);
      }
    }
  }

  // Create explosion shockwave, damage bots, and trigger Rocket Jump
  private createExplosion(pos: THREE.Vector3): void {
    soundManager.playRocketExplosion();

    // Trigger visual explosion system (fire billows, flash, shockwave, shrapnel, scorch)
    this.explosionFX.triggerExplosion(pos);

    // 1. Splash damage bots
    const splashRes = this.botManager.checkExplosion(pos, 300, 125, 720);
    if (splashRes.hits > 0) {
      soundManager.playHitSound();
      this.callbacks.onHitmarker?.();
    }
    if (splashRes.kills > 0) {
      this.callbacks.onFrag?.();
    }

    // 2. ROCKET JUMP: Apply blast impulse to Player!
    this.pmove.applyExplosionImpulse(pos, 860, 300);
  }

  private createTracer(start: THREE.Vector3, end: THREE.Vector3, color = 0x00f0ff): void {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      linewidth: 2
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.activeTracers.push({ line, life: 0.12, maxLife: 0.12 });
  }

  public dispose(): void {
    this.camera.remove(this.viewmodelRoot);
    for (const r of this.activeRockets) this.scene.remove(r.mesh);
    this.explosionFX.dispose();
    for (const t of this.activeTracers) this.scene.remove(t.line);
    for (const rb of this.activeRailBeams) this.scene.remove(rb.group);
  }
}
