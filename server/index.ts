import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ClientMessage,
  ServerMessage,
  PlayerNetState,
  ModelArchetype
} from '../src/net/types';
import type { WeaponType } from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

// -----------------------------------------------------------------------------
// 1. HTTP Static File Server (serves compiled Vite production build)
// -----------------------------------------------------------------------------
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end('Method Not Allowed');
  }

  const urlPath = (req.url || '/').split('?')[0];
  let safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  let filePath = path.join(DIST_DIR, safePath);

  // SPA Fallback: if file doesn't exist, serve index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<h1>Strafe Therapy Server Running</h1><p>Build the frontend with <code>pnpm run build</code></p>');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  });

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
});

// -----------------------------------------------------------------------------
// 2. High-Performance WebSocket Game Server
// -----------------------------------------------------------------------------
const wss = new WebSocketServer({ server });

interface ServerPlayer {
  id: string;
  ws: WebSocket;
  name: string;
  modelArchetype: ModelArchetype;
  colorHex: number;
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
  respawnTimer: number;
  lastUpdate: number;
}

const players = new Map<string, ServerPlayer>();

const ARCHETYPES: ModelArchetype[] = ['Warrior', 'Rogue', 'Minion'];
const PLAYER_COLORS = [
  0x00f0ff, // Cyber Cyan
  0xff0055, // Hot Magenta
  0xff7700, // Fiery Orange
  0x39ff14, // Neon Lime
  0xa855f7, // Royal Purple
  0xfacc15, // Cyber Yellow
  0xec4899  // Deep Pink
];

const SPAWN_POINTS: [number, number, number][] = [
  // Central Rotunda (Ground level)
  [0, 0, -200],
  [200, 0, 0],
  [0, 0, 200],
  [-200, 0, 0],
  // 4 Radial Corridors
  [0, 0, -1200],
  [1200, 0, 0],
  [0, 0, 1200],
  [-1200, 0, 0],
  // 2nd Floor (y = 140)
  [0, 140, -1600],
  [1600, 140, 0],
  [0, 140, 1600],
  [-1600, 140, 0],
  // Outer Ring Bastions
  [2000, 0, 2000],
  [-2000, 0, 2000],
  [2000, 0, -2000],
  [-2000, 0, -2000]
];

function getRandomSpawnPoint(): [number, number, number] {
  const pt = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  return [
    pt[0] + (Math.random() - 0.5) * 80,
    pt[1],
    pt[2] + (Math.random() - 0.5) * 80
  ];
}

function broadcast(msg: ServerMessage, excludeId?: string): void {
  const str = JSON.stringify(msg);
  for (const player of players.values()) {
    if (player.id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(str);
    }
  }
}

function getPlayerDto(p: ServerPlayer): PlayerNetState {
  return {
    id: p.id,
    name: p.name,
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    z: Math.round(p.z * 10) / 10,
    vx: Math.round(p.vx * 10) / 10,
    vy: Math.round(p.vy * 10) / 10,
    vz: Math.round(p.vz * 10) / 10,
    yaw: Math.round(p.yaw * 100) / 100,
    pitch: Math.round(p.pitch * 100) / 100,
    weapon: p.weapon,
    hp: p.hp,
    maxHp: p.maxHp,
    frags: p.frags,
    deaths: p.deaths,
    ping: p.ping,
    isAlive: p.isAlive,
    modelArchetype: p.modelArchetype,
    colorHex: p.colorHex
  };
}

let guestCounter = 1;

wss.on('connection', (ws) => {
  const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
  const spawn = getRandomSpawnPoint();
  const archetype = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
  const color = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
  const defaultName = `Quaker#${guestCounter++}`;

  const player: ServerPlayer = {
    id: playerId,
    ws,
    name: defaultName,
    modelArchetype: archetype,
    colorHex: color,
    x: spawn[0],
    y: spawn[1],
    z: spawn[2],
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    weapon: 'railgun',
    hp: 100,
    maxHp: 100,
    frags: 0,
    deaths: 0,
    ping: 0,
    isAlive: true,
    respawnTimer: 0,
    lastUpdate: Date.now()
  };

  players.set(playerId, player);

  // Send WELCOME packet to connected client
  const allPlayerDtos = Array.from(players.values()).map(getPlayerDto);
  const welcomeMsg: ServerMessage = {
    type: 's_welcome',
    id: playerId,
    name: defaultName,
    players: allPlayerDtos,
    serverTime: Date.now()
  };
  ws.send(JSON.stringify(welcomeMsg));

  // Notify others
  broadcast(
    {
      type: 's_player_joined',
      player: getPlayerDto(player)
    },
    playerId
  );

  console.log(`[NET] Player connected: ${defaultName} (${playerId}) | Total: ${players.size}`);

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString()) as ClientMessage;

      switch (data.type) {
        case 'c_join': {
          if (data.name && typeof data.name === 'string') {
            player.name = data.name.trim().substring(0, 16) || defaultName;
          }
          if (data.modelArchetype && ARCHETYPES.includes(data.modelArchetype)) {
            player.modelArchetype = data.modelArchetype;
          }
          if (typeof data.colorHex === 'number') {
            player.colorHex = data.colorHex;
          }
          break;
        }

        case 'c_update': {
          if (!player.isAlive) break;
          player.x = data.x;
          player.y = data.y;
          player.z = data.z;
          player.vx = data.vx;
          player.vy = data.vy;
          player.vz = data.vz;
          player.yaw = data.yaw;
          player.pitch = data.pitch;
          player.weapon = data.weapon;
          player.lastUpdate = Date.now();
          break;
        }

        case 'c_shoot': {
          if (!player.isAlive) break;
          handlePlayerShoot(player, data.weapon, data.origin, data.dir);
          break;
        }

        case 'c_ping': {
          const pong: ServerMessage = {
            type: 's_pong',
            clientTime: data.clientTime,
            serverTime: Date.now()
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(pong));
          }
          player.ping = Math.max(0, Math.round(Date.now() - data.clientTime));
          break;
        }

        case 'c_respawn': {
          if (!player.isAlive) {
            respawnPlayer(player);
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[NET] Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    players.delete(playerId);
    broadcast({ type: 's_player_left', id: playerId });
    console.log(`[NET] Player disconnected: ${player.name} (${playerId}) | Remaining: ${players.size}`);
  });

  ws.on('error', (err) => {
    console.error(`[NET] WebSocket error for ${playerId}:`, err);
  });
});

// -----------------------------------------------------------------------------
// 3. Combat & Hitscan / Splash Resolution
// -----------------------------------------------------------------------------
function handlePlayerShoot(
  shooter: ServerPlayer,
  weapon: WeaponType,
  origin: [number, number, number],
  dir: [number, number, number]
): void {
  // 1. Broadcast shoot event so all other players see the laser beam / rocket
  broadcast(
    {
      type: 's_shoot',
      shooterId: shooter.id,
      weapon,
      origin,
      dir
    },
    shooter.id
  );

  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;
  const rayLen = Math.hypot(dx, dy, dz);
  if (rayLen < 0.0001) return;
  const ndx = dx / rayLen;
  const ndy = dy / rayLen;
  const ndz = dz / rayLen;

  // Railgun (One-Shot Instant Beam: 100 dmg)
  if (weapon === 'railgun') {
    let closestDist = 5500;
    let hitTarget: ServerPlayer | null = null;

    for (const target of players.values()) {
      if (target.id === shooter.id || !target.isAlive) continue;

      // Capsule / Cylinder hit test: bot/player radius 42, height 110
      const targetCenterY = target.y + 55;
      const toTargetX = target.x - ox;
      const toTargetY = targetCenterY - oy;
      const toTargetZ = target.z - oz;

      // Project target onto ray
      const proj = toTargetX * ndx + toTargetY * ndy + toTargetZ * ndz;
      if (proj <= 0 || proj > closestDist) continue;

      const closestX = ox + ndx * proj;
      const closestY = oy + ndy * proj;
      const closestZ = oz + ndz * proj;

      const distSq =
        (closestX - target.x) ** 2 +
        (closestY - targetCenterY) ** 2 +
        (closestZ - target.z) ** 2;

      if (distSq <= 46 ** 2) {
        closestDist = proj;
        hitTarget = target;
      }
    }

    if (hitTarget) {
      applyDamage(hitTarget, shooter, 100, weapon, [ndx, ndy, ndz], 450);
    }
  }

  // Shotgun (10 Pellets cone raycast: 10 dmg each)
  else if (weapon === 'shotgun') {
    for (const target of players.values()) {
      if (target.id === shooter.id || !target.isAlive) continue;

      const toTargetX = target.x - ox;
      const toTargetY = target.y + 55 - oy;
      const toTargetZ = target.z - oz;
      const dist = Math.hypot(toTargetX, toTargetY, toTargetZ);
      if (dist > 1800) continue;

      const dot = (toTargetX * ndx + toTargetY * ndy + toTargetZ * ndz) / dist;
      if (dot > 0.94) {
        // High accuracy within cone
        const damage = Math.round(18 + Math.random() * 32);
        applyDamage(target, shooter, damage, weapon, [ndx, ndy, ndz], 220);
      }
    }
  }

  // Rocket Splash (Area explosion handled on impact)
  else if (weapon === 'rocket') {
    // Rockets are simulated on clients, but server applies splash if reported
  }
}

function applyDamage(
  victim: ServerPlayer,
  killer: ServerPlayer,
  damage: number,
  weapon: WeaponType,
  hitDir: [number, number, number],
  knockback: number
): void {
  victim.hp = Math.max(0, victim.hp - damage);

  // Knockback physics
  victim.vx += hitDir[0] * knockback;
  victim.vy = Math.max(victim.vy, knockback * 0.4);
  victim.vz += hitDir[2] * knockback;

  // Broadcast hit event
  broadcast({
    type: 's_hit',
    targetId: victim.id,
    damage,
    hp: victim.hp,
    hitDir,
    knockback
  });

  // Check death & trigger Gibs!
  if (victim.hp <= 0 && victim.isAlive) {
    victim.isAlive = false;
    victim.deaths++;
    killer.frags++;
    victim.respawnTimer = 2.8;

    console.log(`[KILL] ${killer.name} fragged ${victim.name} with ${weapon}`);

    // Broadcast death and GIB explosion event
    broadcast({
      type: 's_kill',
      killerId: killer.id,
      victimId: victim.id,
      killerName: killer.name,
      victimName: victim.name,
      weapon,
      pos: [victim.x, victim.y, victim.z],
      hitDir
    });
  }
}

function respawnPlayer(p: ServerPlayer): void {
  const spawn = getRandomSpawnPoint();
  p.x = spawn[0];
  p.y = spawn[1];
  p.z = spawn[2];
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  p.hp = p.maxHp;
  p.isAlive = true;
  p.respawnTimer = 0;
}

// -----------------------------------------------------------------------------
// 4. Server Tick Loop (30 Hz World State Broadcast)
// -----------------------------------------------------------------------------
const TICK_RATE = 30;
const TICK_INTERVAL_MS = 1000 / TICK_RATE;

setInterval(() => {
  const now = Date.now();
  const dt = TICK_INTERVAL_MS / 1000;

  // Auto-respawn check
  for (const p of players.values()) {
    if (!p.isAlive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        respawnPlayer(p);
      }
    }
  }

  // Broadcast world snapshot if there are players
  if (players.size > 0) {
    const allDtos = Array.from(players.values()).map(getPlayerDto);
    const snapshot: ServerMessage = {
      type: 's_snapshot',
      players: allDtos,
      serverTime: now
    };
    broadcast(snapshot);
  }
}, TICK_INTERVAL_MS);

// -----------------------------------------------------------------------------
// 5. Start Server
// -----------------------------------------------------------------------------
server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🎮 Strafe Therapy Unified Game & WebSocket Server`);
  console.log(`📡 Listening on http://${HOST}:${PORT}`);
  console.log(`⚡ WebSocket endpoint at ws://${HOST}:${PORT}`);
  console.log(`📁 Serving static assets from ${DIST_DIR}`);
  console.log(`=======================================================`);
});
