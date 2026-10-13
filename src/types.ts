import * as THREE from 'three';

export interface UserInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  mouseDeltaX: number;
  mouseDeltaY: number;
}

export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  isGrounded: boolean;
  groundNormal: THREE.Vector3;
  jumpQueued: boolean;
  horizontalSpeed: number;
  totalSpeed: number;
  lastGroundTime: number;
  airTime: number;
}

export interface BoxCollider {
  type: 'box';
  min: THREE.Vector3;
  max: THREE.Vector3;
  friction?: number;
}

export interface RampCollider {
  type: 'ramp';
  start: THREE.Vector3;
  end: THREE.Vector3;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  normal: THREE.Vector3;
  planeNormal: THREE.Vector3;
  planeConstant: number;
}

export interface TriggerZone {
  type: 'launchpad' | 'hazard' | 'checkpoint';
  min: THREE.Vector3;
  max: THREE.Vector3;
  boostVelocity?: THREE.Vector3;
  respawnPoint?: THREE.Vector3;
  respawnYaw?: number;
  name?: string;
}

export type WeaponType = 'shotgun' | 'rocket' | 'railgun';

export interface GameSettings {
  mouseSensitivity: number;
  invertY: boolean;
  fovBase: number;
  volume: number;
  autoBhop: boolean;
  trailDuration: number;
  speedMultiplier: number;
  botCount: number;
}

export interface ScoreState {
  currentScore: number;
  comboMultiplier: number;
  peakSpeed: number;
  highScore: number;
  highPeakSpeed: number;
  strafeSyncPct: number;
  frags: number;
}
