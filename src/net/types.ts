import type { WeaponType } from '../types';

export type ModelArchetype = 'Warrior' | 'Rogue' | 'Minion';

export interface PlayerNetState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  weapon: WeaponType;
  hp: number;
  maxHp: number;
  frags: number;
  deaths: number;
  ping: number;
  isAlive: boolean;
  modelArchetype: ModelArchetype;
  colorHex: number;
}

// Client -> Server Messages
export type ClientMessage =
  | {
      type: 'c_join';
      name: string;
      modelArchetype?: ModelArchetype;
      colorHex?: number;
    }
  | {
      type: 'c_update';
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      yaw: number;
      pitch: number;
      weapon: WeaponType;
    }
  | {
      type: 'c_shoot';
      weapon: WeaponType;
      origin: [number, number, number];
      dir: [number, number, number];
    }
  | {
      type: 'c_ping';
      clientTime: number;
    }
  | {
      type: 'c_respawn';
    };

// Server -> Client Messages
export type ServerMessage =
  | {
      type: 's_welcome';
      id: string;
      name: string;
      players: PlayerNetState[];
      serverTime: number;
    }
  | {
      type: 's_snapshot';
      players: PlayerNetState[];
      serverTime: number;
    }
  | {
      type: 's_player_joined';
      player: PlayerNetState;
    }
  | {
      type: 's_player_left';
      id: string;
    }
  | {
      type: 's_shoot';
      shooterId: string;
      weapon: WeaponType;
      origin: [number, number, number];
      dir: [number, number, number];
    }
  | {
      type: 's_hit';
      targetId: string;
      damage: number;
      hp: number;
      hitDir?: [number, number, number];
      knockback?: number;
    }
  | {
      type: 's_kill';
      killerId: string;
      victimId: string;
      killerName: string;
      victimName: string;
      weapon: WeaponType;
      pos: [number, number, number];
      hitDir?: [number, number, number];
    }
  | {
      type: 's_pong';
      clientTime: number;
      serverTime: number;
    };
