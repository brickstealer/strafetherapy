import * as THREE from 'three';
import type { SkeletonTemplate } from '../entities/botManager';
import type { GoreSystem } from '../graphics/goreSystem';
import type {
  ClientMessage,
  ServerMessage,
  PlayerNetState
} from './types';
import { RemotePlayer } from './remotePlayer';
import type { WeaponType } from '../types';

export interface NetworkCallbacks {
  onKillfeed: (killer: string, victim: string, weapon: WeaponType) => void;
  onPlayerCountChange: (count: number, ping: number) => void;
  onRemoteRailBeam: (origin: THREE.Vector3, dir: THREE.Vector3) => void;
  onLocalDamaged: (damage: number, hitDir?: THREE.Vector3, knockback?: number) => void;
  onLocalKilled: (killerName: string, weapon: WeaponType) => void;
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private scene: THREE.Scene;
  private goreSystem?: GoreSystem;
  private callbacks: NetworkCallbacks;
  private templates: SkeletonTemplate[] = [];

  public myId: string | null = null;
  public myName = 'Player';
  public isConnected = false;
  public ping = 0;
  public remotePlayers: Map<string, RemotePlayer> = new Map();
  public scoreboard: PlayerNetState[] = [];

  private lastUpdateSent = 0;
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;

  constructor(
    scene: THREE.Scene,
    callbacks: NetworkCallbacks,
    goreSystem?: GoreSystem
  ) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.goreSystem = goreSystem;

    this.loadSavedName();
  }

  public setTemplates(templates: SkeletonTemplate[]): void {
    this.templates = templates;
  }

  private loadSavedName(): void {
    try {
      const saved = localStorage.getItem('strafe_therapy_nickname');
      if (saved && saved.trim()) {
        this.myName = saved.trim().substring(0, 16);
      } else {
        this.myName = `Quaker#${Math.floor(100 + Math.random() * 900)}`;
      }
    } catch {
      this.myName = 'Quaker';
    }
  }

  public setPlayerName(name: string): void {
    const clean = name.trim().substring(0, 16) || 'Player';
    this.myName = clean;
    try {
      localStorage.setItem('strafe_therapy_nickname', clean);
    } catch {
      // Ignore
    }
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'c_join', name: clean };
      this.ws.send(JSON.stringify(msg));
    }
  }

  public connect(url?: string): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
    }

    let wsUrl = url;
    if (!wsUrl) {
      if (import.meta.env?.VITE_WS_URL) {
        wsUrl = import.meta.env.VITE_WS_URL;
      } else {
        const isHttps = window.location.protocol === 'https:';
        const wsProto = isHttps ? 'wss:' : 'ws:';
        // In dev mode (Vite proxy) and production, connect directly to current host/ws
        wsUrl = `${wsProto}//${window.location.host}/ws`;
      }
    }

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = () => {
        // Offline fallback
      };
    } catch (err) {
      console.warn('[NET] WebSocket connection failed, offline mode active:', err);
    }
  }

  private handleOpen(): void {
    this.isConnected = true;
    console.log('[NET] Connected to Strafe Therapy multiplayer server!');

    // Send Join info
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = {
        type: 'c_join',
        name: this.myName
      };
      this.ws.send(JSON.stringify(msg));
    }

    // Start 1s ping heartbeats
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMsg: ClientMessage = {
          type: 'c_ping',
          clientTime: Date.now()
        };
        this.ws.send(JSON.stringify(pingMsg));
      }
    }, 1000);
  }

  private handleClose(): void {
    this.isConnected = false;
    this.myId = null;
    if (this.pingInterval) clearInterval(this.pingInterval);

    // Clean up all remote players
    for (const p of this.remotePlayers.values()) {
      p.dispose(this.scene);
    }
    this.remotePlayers.clear();
    this.scoreboard = [];
    this.callbacks.onPlayerCountChange(1, 0);

    // Auto-reconnect after 4s
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, 4000);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data) as ServerMessage;

      switch (data.type) {
        case 's_welcome': {
          this.myId = data.id;
          this.myName = data.name;
          this.syncSnapshot(data.players);
          break;
        }

        case 's_snapshot': {
          this.syncSnapshot(data.players);
          break;
        }

        case 's_player_left': {
          const p = this.remotePlayers.get(data.id);
          if (p) {
            p.dispose(this.scene);
            this.remotePlayers.delete(data.id);
          }
          break;
        }

        case 's_shoot': {
          if (data.shooterId !== this.myId) {
            if (data.weapon === 'railgun') {
              const orig = new THREE.Vector3(...data.origin);
              const dir = new THREE.Vector3(...data.dir);
              this.callbacks.onRemoteRailBeam(orig, dir);
            }
          }
          break;
        }

        case 's_hit': {
          if (data.targetId === this.myId) {
            const dir = data.hitDir ? new THREE.Vector3(...data.hitDir) : undefined;
            this.callbacks.onLocalDamaged(data.damage, dir, data.knockback);
          }
          break;
        }

        case 's_kill': {
          // 1. Killfeed Announcement
          this.callbacks.onKillfeed(data.killerName, data.victimName, data.weapon);

          // 2. Synchronized Brutal Gib Explosion!
          if (this.goreSystem) {
            const pos = new THREE.Vector3(...data.pos);
            const dir = data.hitDir ? new THREE.Vector3(...data.hitDir) : undefined;
            this.goreSystem.spawnGibExplosion(pos, dir, 3, Infinity);
          }

          // 3. If local player was fragged
          if (data.victimId === this.myId) {
            this.callbacks.onLocalKilled(data.killerName, data.weapon);
          }
          break;
        }

        case 's_pong': {
          this.ping = Math.max(0, Math.round(Date.now() - data.clientTime));
          this.callbacks.onPlayerCountChange(this.remotePlayers.size + 1, this.ping);
          break;
        }
      }
    } catch (err) {
      console.warn('[NET] Error handling message:', err);
    }
  }

  private syncSnapshot(playerDtos: PlayerNetState[]): void {
    this.scoreboard = playerDtos.sort((a, b) => b.frags - a.frags);
    this.callbacks.onPlayerCountChange(playerDtos.length, this.ping);

    const activeIds = new Set<string>();

    for (const dto of playerDtos) {
      activeIds.add(dto.id);

      if (dto.id === this.myId) {
        continue;
      }

      let remote = this.remotePlayers.get(dto.id);
      if (!remote) {
        if (this.templates.length > 0) {
          const tpl =
            this.templates.find((t) => t.name === dto.modelArchetype) ||
            this.templates[0];
          remote = new RemotePlayer(this.scene, dto, tpl);
          this.remotePlayers.set(dto.id, remote);
        }
      } else {
        remote.updateData(dto);
      }
    }

    // Remove disconnected
    for (const [id, remote] of this.remotePlayers.entries()) {
      if (!activeIds.has(id)) {
        remote.dispose(this.scene);
        this.remotePlayers.delete(id);
      }
    }
  }

  // Send local player physics state 30 times per second
  public sendUpdate(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    yaw: number,
    pitch: number,
    weapon: WeaponType
  ): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const now = performance.now();
    if (now - this.lastUpdateSent < 32) return; // ~30 Hz throttle
    this.lastUpdateSent = now;

    const msg: ClientMessage = {
      type: 'c_update',
      x: pos.x,
      y: pos.y,
      z: pos.z,
      vx: vel.x,
      vy: vel.y,
      vz: vel.z,
      yaw,
      pitch,
      weapon
    };

    this.ws.send(JSON.stringify(msg));
  }

  // Broadcast shoot event to server
  public sendShoot(
    weapon: WeaponType,
    origin: THREE.Vector3,
    dir: THREE.Vector3
  ): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const msg: ClientMessage = {
      type: 'c_shoot',
      weapon,
      origin: [origin.x, origin.y, origin.z],
      dir: [dir.x, dir.y, dir.z]
    };

    this.ws.send(JSON.stringify(msg));
  }

  public update(dt: number, camera: THREE.Camera): void {
    for (const remote of this.remotePlayers.values()) {
      remote.update(dt, camera);
    }
  }

  public dispose(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
    }
    for (const p of this.remotePlayers.values()) {
      p.dispose(this.scene);
    }
    this.remotePlayers.clear();
  }
}
