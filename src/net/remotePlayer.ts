import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { SkeletonTemplate } from '../entities/botManager';
import type { PlayerNetState } from './types';
import type { WeaponType } from '../types';

export class RemotePlayer {
  public id: string;
  public name: string;
  public mesh: THREE.Group;
  public isAlive = true;
  public hp = 100;
  public maxHp = 100;
  public frags = 0;
  public deaths = 0;
  public ping = 0;
  public currentWeapon: WeaponType = 'railgun';

  // Interpolation targets
  private targetPos = new THREE.Vector3();
  private targetVel = new THREE.Vector3();
  private targetYaw = 0;
  private currentYaw = 0;

  // 3D Skinned Model
  private model: THREE.Group;
  private mixer?: THREE.AnimationMixer;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentActionName = 'idle';

  // 3D Billboard Nameplate & HP
  private nameplateSprite: THREE.Sprite;
  private nameplateCanvas: HTMLCanvasElement;
  private nameplateCtx: CanvasRenderingContext2D;
  private nameplateTexture: THREE.CanvasTexture;
  private colorHex: number;

  constructor(
    scene: THREE.Scene,
    initialData: PlayerNetState,
    template: SkeletonTemplate
  ) {
    this.id = initialData.id;
    this.name = initialData.name;
    this.hp = initialData.hp;
    this.maxHp = initialData.maxHp;
    this.frags = initialData.frags;
    this.deaths = initialData.deaths;
    this.ping = initialData.ping;
    this.isAlive = initialData.isAlive;
    this.currentWeapon = initialData.weapon;
    this.colorHex = initialData.colorHex || 0x00f0ff;

    this.mesh = new THREE.Group();
    this.mesh.position.set(initialData.x, initialData.y, initialData.z);
    this.targetPos.copy(this.mesh.position);

    // 1. Clone realistic 3D Skeleton Model
    this.model = cloneSkeleton(template.scene) as THREE.Group;
    this.model.scale.setScalar(52.0);
    this.mesh.add(this.model);

    // 2. Glowing Demonic Eyes matching player's custom neon color
    this.setupGlowingEyes(this.colorHex);

    // 3. Animation State Machine
    this.setupAnimations(template.animations);

    // 4. Ultra-crisp 2D Billboard Nameplate & Health Bar
    this.nameplateCanvas = document.createElement('canvas');
    this.nameplateCanvas.width = 512;
    this.nameplateCanvas.height = 128;
    this.nameplateCtx = this.nameplateCanvas.getContext('2d')!;
    this.nameplateTexture = new THREE.CanvasTexture(this.nameplateCanvas);
    this.nameplateTexture.minFilter = THREE.LinearFilter;
    this.nameplateTexture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.nameplateTexture,
      transparent: true,
      depthTest: false
    });
    this.nameplateSprite = new THREE.Sprite(spriteMat);
    this.nameplateSprite.position.set(0, 126, 0);
    this.nameplateSprite.scale.set(70, 17.5, 1);
    this.mesh.add(this.nameplateSprite);

    this.redrawNameplate();

    scene.add(this.mesh);
  }

  private setupGlowingEyes(colorHex: number): void {
    const eyeMat = new THREE.MeshBasicMaterial({ color: colorHex });
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.name.toLowerCase().includes('eye')) {
          child.material = eyeMat;
          const eyeLight = new THREE.PointLight(colorHex, 2.5, 60);
          eyeLight.position.set(0, 0, 0.2);
          child.add(eyeLight);
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

    const idleClip = findClip('Idle', 'Idle_Combat', 'Unarmed_Idle');
    const runClip = findClip('Running_B', 'Running_A', 'Running_C');
    const walkClip = findClip('Walking_A', 'Walking_B', 'Walking_D_Skeletons');
    const jumpClip = findClip('Jump_Idle', 'Jump_Full_Short', 'Jump_Start');

    if (idleClip) this.actions.set('idle', this.mixer.clipAction(idleClip));
    if (runClip) this.actions.set('run', this.mixer.clipAction(runClip));
    if (walkClip) this.actions.set('walk', this.mixer.clipAction(walkClip));
    if (jumpClip) this.actions.set('jump', this.mixer.clipAction(jumpClip));

    const initAct = this.actions.get('idle') || this.actions.get('run');
    if (initAct) {
      initAct.play();
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
      if (currAct) currAct.crossFadeTo(nextAct, fadeDuration, true);
      nextAct.play();
      this.currentActionName = name;
    }
  }

  public redrawNameplate(): void {
    const ctx = this.nameplateCtx;
    const w = this.nameplateCanvas.width;
    const h = this.nameplateCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark sleek semi-transparent backing card
    ctx.fillStyle = 'rgba(7, 10, 18, 0.75)';
    ctx.roundRect(16, 12, w - 32, h - 24, 16);
    ctx.fill();

    // Subtle neon border
    const hexStr = '#' + this.colorHex.toString(16).padStart(6, '0');
    ctx.strokeStyle = hexStr;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Player Nickname
    ctx.font = 'bold 36px "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = hexStr;
    ctx.shadowBlur = 12;
    ctx.fillText(this.name, w * 0.5, 54);
    ctx.shadowBlur = 0;

    // Health Bar Background Track
    const barX = 40;
    const barY = 74;
    const barW = w - 80;
    const barH = 22;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.roundRect(barX, barY, barW, barH, 8);
    ctx.fill();

    // Health Bar Fill
    const pct = Math.max(0, Math.min(1.0, this.hp / this.maxHp));
    if (pct > 0) {
      const grad = ctx.createLinearGradient(barX, 0, barX + barW * pct, 0);
      if (pct > 0.5) {
        grad.addColorStop(0, '#22c55e');
        grad.addColorStop(1, '#4ade80');
      } else if (pct > 0.25) {
        grad.addColorStop(0, '#eab308');
        grad.addColorStop(1, '#facc15');
      } else {
        grad.addColorStop(0, '#ef4444');
        grad.addColorStop(1, '#f87171');
      }
      ctx.fillStyle = grad;
      ctx.roundRect(barX, barY, barW * pct, barH, 8);
      ctx.fill();
    }

    this.nameplateTexture.needsUpdate = true;
  }

  public updateData(dto: PlayerNetState): void {
    this.targetPos.set(dto.x, dto.y, dto.z);
    this.targetVel.set(dto.vx, dto.vy, dto.vz);
    this.targetYaw = dto.yaw;
    this.frags = dto.frags;
    this.deaths = dto.deaths;
    this.ping = dto.ping;
    this.currentWeapon = dto.weapon;

    if (this.hp !== dto.hp || this.name !== dto.name) {
      this.hp = dto.hp;
      this.name = dto.name;
      this.redrawNameplate();
    }

    if (this.isAlive !== dto.isAlive) {
      this.isAlive = dto.isAlive;
      this.model.visible = this.isAlive;
      this.nameplateSprite.visible = this.isAlive;
    }
  }

  public update(dt: number, camera: THREE.Camera): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }

    if (!this.isAlive) return;

    // Smooth LERP position interpolation
    this.mesh.position.lerp(this.targetPos, Math.min(1.0, dt * 20));

    // Smooth Yaw angular interpolation
    let diffYaw = this.targetYaw - this.currentYaw;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    this.currentYaw += diffYaw * Math.min(1.0, dt * 16);
    this.mesh.rotation.y = this.currentYaw;

    // Animation state blending
    const horizSpeed = Math.hypot(this.targetVel.x, this.targetVel.z);
    const inAir = this.mesh.position.y > 2.0;

    if (inAir) {
      this.playAction('jump', 0.15);
    } else if (horizSpeed > 80) {
      this.playAction('run', 0.2);
    } else if (horizSpeed > 10) {
      this.playAction('walk', 0.2);
    } else {
      this.playAction('idle', 0.25);
    }

    // Nameplate always faces local player camera
    this.nameplateSprite.quaternion.copy(camera.quaternion);
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.nameplateTexture.dispose();
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
