import * as THREE from 'three';
import type { UserInput } from './types';
import { Pmove } from './physics/pmove';
import { WorldMap } from './world/map';
import { TrailRenderer } from './graphics/trail';
import { soundManager } from './audio/synth';
import { Hud } from './ui/hud';
import { BotManager } from './entities/botManager';
import { WeaponManager } from './weapons/weapons';
import { GoreSystem } from './graphics/goreSystem';

class Game {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private canvas!: HTMLCanvasElement;
  private hudRoot!: HTMLElement;

  private map!: WorldMap;
  private pmove!: Pmove;
  private trail!: TrailRenderer;
  private hud!: Hud;
  private dirLight!: THREE.DirectionalLight;
  private botManager!: BotManager;
  private weaponManager!: WeaponManager;
  private goreSystem!: GoreSystem;

  // Input State
  private input: UserInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    crouch: false,
    mouseDeltaX: 0,
    mouseDeltaY: 0
  };

  private isPointerLocked = false;
  private isMouseDown = false;
  private lastFrameTime = performance.now();
  private physicsAccumulator = 0;
  private currentRoll = 0;

  constructor() {
    this.canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
    this.hudRoot = document.getElementById('hud-root') as HTMLElement;

    this.initGraphics();
    this.initUI();
    this.initWorld();
    this.attachInputHandlers();

    // Start render loop
    requestAnimationFrame(this.animate.bind(this));
  }

  private initGraphics(): void {
    // 1. Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090e);
    this.scene.fog = new THREE.FogExp2(0x07090e, 0.0004);

    // 2. Camera (far plane 10000 for 6500u castle citadel)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(90, aspect, 1, 10000);
    this.camera.rotation.order = 'YXZ';

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // 4. Lighting (Illumination across the 6,500u Citadel)
    const ambientLight = new THREE.AmbientLight(0x2a3345, 1.4);
    this.scene.add(ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4e0, 1.8);
    this.dirLight.position.set(500, 1200, 600);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 100;
    this.dirLight.shadow.camera.far = 2800;
    const d = 1100;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Cyan secondary fill light for cyber/gothic contrast
    const cyanLight = new THREE.DirectionalLight(0x00d4ff, 0.9);
    cyanLight.position.set(-1500, 1200, -1500);
    this.scene.add(cyanLight);

    // Warm orange accent rim light
    const orangeLight = new THREE.DirectionalLight(0xf97316, 0.85);
    orangeLight.position.set(1500, 1200, 1500);
    this.scene.add(orangeLight);

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private initWorld(): void {
    this.map = new WorldMap(this.scene);
    this.pmove = new Pmove(this.map.spawnPoint, this.map.collisionWorld);
    this.pmove.state.yaw = this.map.spawnYaw;

    this.trail = new TrailRenderer(this.scene);

    // Bind physics audio & gameplay callbacks
    this.pmove.callbacks = {
      onJump: () => {
        soundManager.playJump();
      },
      onLand: (impact) => {
        soundManager.playLand(impact);
      },
      onLaunchPad: () => {
        soundManager.playLaunchPad();
      },
      onHazard: () => {
        soundManager.playRespawn();
        this.trail.clear();
      },
      onMilestone: (stage) => {
        soundManager.playMilestone(stage);
      },
      onWallHit: (loss) => {
        this.hud.onWallHit(loss);
      }
    };

    // Bots, Gore & Weapons
    this.goreSystem = new GoreSystem(this.scene);
    this.botManager = new BotManager(this.scene, this.map.collisionWorld.castleBounds, this.goreSystem);
    this.botManager.setBotCount(this.hud.settings.botCount);
    this.botManager.setGoreSettings(this.hud.settings.goreLevel, this.hud.settings.bloodDuration);

    this.weaponManager = new WeaponManager(
      this.scene,
      this.camera,
      this.botManager,
      this.pmove,
      {
        onHitmarker: () => this.hud.triggerHitmarker(),
        onFrag: () => this.hud.addFrag(),
        onWeaponChange: (w) => this.hud.setWeapon(w)
      }
    );
    this.hud.setWeapon(this.weaponManager.currentWeapon);

    soundManager.setVolume(this.hud.settings.volume);
    this.trail.setLifetime(this.hud.settings.trailDuration);
    this.pmove.setSpeedMultiplier(this.hud.settings.speedMultiplier);
  }

  private initUI(): void {
    this.hud = new Hud(this.hudRoot, {
      onResume: () => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        soundManager.init();
        soundManager.resume();
        this.requestPointerLock();
        this.hud.setPaused(false);
      },
      onResetPosition: () => {
        this.resetPlayerPosition();
      },
      onSettingsChange: (settings) => {
        soundManager.setVolume(settings.volume);
        this.camera.fov = settings.fovBase;
        this.camera.updateProjectionMatrix();
        this.trail.setLifetime(settings.trailDuration);
        if (this.pmove) this.pmove.setSpeedMultiplier(settings.speedMultiplier);
        if (this.botManager) {
          this.botManager.setBotCount(settings.botCount);
          this.botManager.setGoreSettings(settings.goreLevel, settings.bloodDuration);
        }
      },
      onToggleSound: () => {
        soundManager.toggleMute();
      }
    });
  }

  private attachInputHandlers(): void {
    // Keyboard Listeners
    window.addEventListener('keydown', (e) => {
      const code = e.code || (e.key === ' ' ? 'Space' : e.key);
      if (code === 'Space' || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
      this.handleKeyEvent(code, true);
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code || (e.key === ' ' ? 'Space' : e.key);
      if (code === 'Space') {
        e.preventDefault();
      }
      this.handleKeyEvent(code, false);
    });

    // Mouse Movement Listener (Pointer Lock)
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;

      const sens = this.hud.settings.mouseSensitivity;
      const invertY = this.hud.settings.invertY ? -1 : 1;

      const deltaX = e.movementX;
      const deltaY = e.movementY;

      // Update View Yaw & Pitch
      this.pmove.state.yaw -= deltaX * sens;
      // Wrap yaw between 0 and 2*PI
      this.pmove.state.yaw = (this.pmove.state.yaw + Math.PI * 2) % (Math.PI * 2);

      this.pmove.state.pitch -= deltaY * sens * invertY;
      // Clamp pitch (-86° to +86°)
      const maxPitch = 1.48;
      this.pmove.state.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pmove.state.pitch));

      // Record mouse delta for Strafe Sync detection
      this.input.mouseDeltaX = deltaX;
      this.input.mouseDeltaY = deltaY;
    });

    // Pointer Lock Change Detection
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.isPointerLocked;
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      if (wasLocked && !this.isPointerLocked) {
        this.hud.setPaused(true);
      } else if (this.isPointerLocked) {
        this.hud.setPaused(false);
      }
    });

    // Canvas click triggers lock if paused
    this.canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        soundManager.init();
        soundManager.resume();
        this.requestPointerLock();
      }
    });

    // Mouse buttons for shooting
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isPointerLocked) {
        this.isMouseDown = true;
        this.weaponManager.shoot();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      }
    });

    // Weapon Wheel Switch
    window.addEventListener('wheel', () => {
      if (this.isPointerLocked) {
        this.weaponManager.toggleWeapon();
      }
    }, { passive: true });
  }

  private handleKeyEvent(code: string, isDown: boolean): void {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.input.forward = isDown;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.input.backward = isDown;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.input.left = isDown;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.input.right = isDown;
        break;
      case 'Space':
        this.input.jump = isDown;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.crouch = isDown;
        break;
      case 'Digit1':
        if (isDown) this.weaponManager.switchWeapon('shotgun');
        break;
      case 'Digit2':
        if (isDown) this.weaponManager.switchWeapon('rocket');
        break;
      case 'Digit3':
        if (isDown) this.weaponManager.switchWeapon('railgun');
        break;
      case 'KeyQ':
        if (isDown) this.weaponManager.toggleWeapon();
        break;
      case 'KeyR':
        if (isDown) {
          this.resetPlayerPosition();
        }
        break;
      case 'Escape':
        if (isDown && this.isPointerLocked) {
          document.exitPointerLock();
        }
        break;
    }
  }

  private requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  private resetPlayerPosition(): void {
    this.pmove.setPosition(this.map.spawnPoint, this.map.spawnYaw);
    this.trail.clear();
  }

  private onWindowResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // Main Render & Physics Tick Loop
  private animate(now: number): void {
    requestAnimationFrame(this.animate.bind(this));

    const frameTimeSec = Math.min(0.2, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // 0. Auto-shoot if mouse held
    if (this.isMouseDown && !this.hud.isMenuOpen()) {
      this.weaponManager.shoot();
    }

    // 1. Fixed 125 Hz Physics Simulation Step Accumulator
    if (!this.hud.isMenuOpen()) {
      this.physicsAccumulator += frameTimeSec;
      while (this.physicsAccumulator >= Pmove.FIXED_DT) {
        this.pmove.tick(this.input, Pmove.FIXED_DT);
        this.physicsAccumulator -= Pmove.FIXED_DT;
      }
    }

    const state = this.pmove.state;
    const speed = state.horizontalSpeed;

    // 2. Camera Rigging & Dynamic FOV
    // Position at eye height
    this.camera.position.set(
      state.position.x,
      state.position.y + Pmove.EYE_HEIGHT,
      state.position.z
    );

    // Dynamic FOV expansion: base FOV up to base + 24° at high speeds
    const baseFov = this.hud.settings.fovBase;
    const targetFov = this.hud.isMenuOpen() ? baseFov : baseFov + Math.min(24, (speed / 1200) * 24);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, frameTimeSec * 10);
    this.camera.updateProjectionMatrix();

    // Camera roll tilt: subtle roll when turning and strafing
    const strafeRollTarget = (this.input.left ? 0.022 : this.input.right ? -0.022 : 0) +
      (-this.input.mouseDeltaX * 0.001);
    this.currentRoll += (strafeRollTarget - this.currentRoll) * Math.min(1.0, frameTimeSec * 12);
    this.currentRoll = Math.max(-0.045, Math.min(0.045, this.currentRoll));

    this.camera.rotation.set(state.pitch, state.yaw, this.currentRoll, 'YXZ');

    // Follow directional light with player for crisp local dynamic shadows anywhere on the Citadel
    this.dirLight.target.position.copy(state.position);
    this.dirLight.position.set(state.position.x + 500, state.position.y + 1200, state.position.z + 600);

    // 3. Update Visual Trail Ribbon
    this.trail.update(state.position, speed, now / 1000, this.camera.position);

    // 4. Update Web Audio Wind Rush
    soundManager.updateSpeedNoise(speed);

    // 5. Update HUD (Speedometer, Sync Bar, Score, Multipliers)
    this.hud.update(
      speed,
      frameTimeSec,
      state.isGrounded,
      this.input.mouseDeltaX,
      this.input.left,
      this.input.right
    );

    // Decay mouse delta towards zero
    this.input.mouseDeltaX *= 0.65;
    this.input.mouseDeltaY *= 0.65;

    // 6. Update Animated Torches & Lights
    this.map.update(now / 1000);

    // 7. Update Bots, Weapons & Gore System
    this.botManager.update(frameTimeSec, this.camera);
    this.weaponManager.update(frameTimeSec, speed);
    this.goreSystem.update(frameTimeSec, this.hud.settings.bloodDuration);

    // 8. Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
