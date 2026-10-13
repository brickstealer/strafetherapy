import * as THREE from 'three';
import type { CollisionWorld } from '../physics/pmove';
import { generateCastleFloorTextures, createCastleRosetteGroup } from './castleFloor';

export interface Torch {
  light?: THREE.PointLight;
  flameMesh: THREE.Mesh;
  baseIntensity: number;
  flickerSpeed: number;
  seed: number;
}

export class WorldMap {
  public scene: THREE.Scene;
  public collisionWorld: CollisionWorld;
  public spawnPoint: THREE.Vector3;
  public spawnYaw: number;
  public torches: Torch[] = [];

  // Reusable materials & textures
  private materials: { [key: string]: THREE.Material } = {};
  private textures: { [key: string]: THREE.Texture } = {};
  private paintingsTextures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.collisionWorld = {
      boxes: [],
      ramps: [],
      triggers: [],
      castleBounds: {
        centerRadius: 600,
        corridorHalfWidth: 200,
        ringInnerRadius: 2800,
        ringOuterRadius: 3250,
        floor2Height: 140
      }
    };
    this.spawnPoint = new THREE.Vector3(0, 0, 0);
    this.spawnYaw = 0; // Looking towards -Z (North Corridor)

    this.initTexturesAndMaterials();
    this.buildLevelGeometry();
  }

  // Create retro cyber Defrag & Gothic Castle textures
  private initTexturesAndMaterials(): void {
    // 1. Medieval Castle Stone Flagstone Textures (Diffuse, Normal, Roughness)
    const castleFloor = generateCastleFloorTextures();
    this.textures['floor'] = castleFloor.diffuse;
    this.textures['floorNormal'] = castleFloor.normal;
    this.textures['floorRoughness'] = castleFloor.roughness;

    // 2. Gothic Stone Brick Wall Texture (For Corridors)
    const stoneCanvas = document.createElement('canvas');
    stoneCanvas.width = 512;
    stoneCanvas.height = 512;
    const ctxS = stoneCanvas.getContext('2d')!;

    ctxS.fillStyle = '#171923';
    ctxS.fillRect(0, 0, 512, 512);

    // Stone brick rows
    const rowH = 64;
    for (let y = 0; y < 512; y += rowH) {
      const isOffset = (y / rowH) % 2 === 1;
      const brickW = 128;
      const startX = isOffset ? -64 : 0;

      for (let x = startX; x < 512 + 64; x += brickW) {
        // Brick background
        ctxS.fillStyle = Math.random() > 0.5 ? '#1f2430' : '#1a1f2c';
        ctxS.fillRect(x + 2, y + 2, brickW - 4, rowH - 4);

        // Mortar lines
        ctxS.strokeStyle = '#0d0f14';
        ctxS.lineWidth = 3;
        ctxS.strokeRect(x, y, brickW, rowH);

        // Weathering cracks & moss details
        ctxS.strokeStyle = 'rgba(255, 120, 40, 0.08)';
        ctxS.beginPath();
        ctxS.moveTo(x + 10, y + 20);
        ctxS.lineTo(x + 40, y + 25);
        ctxS.stroke();
      }
    }

    // Top & Bottom neon accent borders on stone
    ctxS.fillStyle = '#f97316';
    ctxS.fillRect(0, 0, 512, 6);
    ctxS.fillStyle = '#38bdf8';
    ctxS.fillRect(0, 506, 512, 6);

    const stoneTex = new THREE.CanvasTexture(stoneCanvas);
    stoneTex.wrapS = THREE.RepeatWrapping;
    stoneTex.wrapT = THREE.RepeatWrapping;
    this.textures['stoneWall'] = stoneTex;

    // 3. Wall Dev-Texture with orange trim
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const ctxW = wallCanvas.getContext('2d')!;
    ctxW.fillStyle = '#111827';
    ctxW.fillRect(0, 0, 512, 512);
    ctxW.fillStyle = '#0f172a';
    ctxW.fillRect(16, 16, 480, 480);
    ctxW.strokeStyle = '#f97316';
    ctxW.lineWidth = 6;
    ctxW.strokeRect(8, 8, 496, 496);
    const wallTex = new THREE.CanvasTexture(wallCanvas);
    wallTex.wrapS = THREE.RepeatWrapping;
    wallTex.wrapT = THREE.RepeatWrapping;
    this.textures['wall'] = wallTex;

    // 4. Launchpad Glow Grid
    const padCanvas = document.createElement('canvas');
    padCanvas.width = 256;
    padCanvas.height = 256;
    const ctxP = padCanvas.getContext('2d')!;
    ctxP.fillStyle = '#050505';
    ctxP.fillRect(0, 0, 256, 256);
    ctxP.strokeStyle = '#00f0ff';
    ctxP.lineWidth = 8;
    for (let y = 60; y <= 200; y += 45) {
      ctxP.beginPath();
      ctxP.moveTo(60, y + 20);
      ctxP.lineTo(128, y - 20);
      ctxP.lineTo(196, y + 20);
      ctxP.stroke();
    }
    const padTex = new THREE.CanvasTexture(padCanvas);
    this.textures['pad'] = padTex;

    // 5. Hazard Void Grid
    const hazardCanvas = document.createElement('canvas');
    hazardCanvas.width = 256;
    hazardCanvas.height = 256;
    const ctxH = hazardCanvas.getContext('2d')!;
    ctxH.fillStyle = '#1a0515';
    ctxH.fillRect(0, 0, 256, 256);
    ctxH.strokeStyle = '#ff0055';
    ctxH.lineWidth = 4;
    for (let i = 0; i <= 256; i += 32) {
      ctxH.beginPath(); ctxH.moveTo(i, 0); ctxH.lineTo(i, 256); ctxH.stroke();
      ctxH.beginPath(); ctxH.moveTo(0, i); ctxH.lineTo(256, i); ctxH.stroke();
    }
    const hazardTex = new THREE.CanvasTexture(hazardCanvas);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.wrapT = THREE.RepeatWrapping;
    this.textures['hazard'] = hazardTex;

    // 6. Generate 5 Procedural Paintings (Medieval Gothic & Speed Legends)
    this.generatePaintings();

    // Materials
    this.materials['floor'] = new THREE.MeshStandardMaterial({
      map: this.textures['floor'],
      normalMap: this.textures['floorNormal'],
      normalScale: new THREE.Vector2(1.8, 1.8),
      roughnessMap: this.textures['floorRoughness'],
      roughness: 0.65,
      metalness: 0.12
    });

    this.materials['stoneWall'] = new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.8,
      metalness: 0.15
    });

    this.materials['wall'] = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.6,
      metalness: 0.3
    });

    this.materials['pillar'] = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.6
    });

    this.materials['goldFrame'] = new THREE.MeshStandardMaterial({
      color: 0xc8963e,
      roughness: 0.3,
      metalness: 0.8
    });

    this.materials['ironTorch'] = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      roughness: 0.4,
      metalness: 0.9
    });

    this.materials['woodTorch'] = new THREE.MeshStandardMaterial({
      color: 0x5a3418,
      roughness: 0.8,
      metalness: 0.1
    });

    this.materials['fire'] = new THREE.MeshBasicMaterial({
      color: 0xff7700
    });

    this.materials['neonCyan'] = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.materials['neonOrange'] = new THREE.MeshBasicMaterial({ color: 0xff6600 });

    this.materials['launchpad'] = new THREE.MeshStandardMaterial({
      map: padTex,
      emissive: new THREE.Color(0x00ffcc),
      emissiveIntensity: 0.9,
      roughness: 0.3
    });

    this.materials['hazard'] = new THREE.MeshBasicMaterial({
      map: hazardTex,
      transparent: true,
      opacity: 0.85
    });

    this.materials['ramp'] = new THREE.MeshStandardMaterial({
      map: this.textures['floor'],
      normalMap: this.textures['floorNormal'],
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughnessMap: this.textures['floorRoughness'],
      roughness: 0.6,
      metalness: 0.12
    });
  }

  // Generate 5 distinct oil paintings with procedural canvas art
  private generatePaintings(): void {
    const titles = [
      'The Blood Moon Citadel',
      'Knight of Quake',
      'Tormented Rune Portal',
      'Skulls of the Damned',
      'Champion of Defrag'
    ];

    titles.forEach((_, idx) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 768;
      const ctx = c.getContext('2d')!;

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 768);
      if (idx === 0) {
        grad.addColorStop(0, '#2b0c15');
        grad.addColorStop(0.5, '#4a1525');
        grad.addColorStop(1, '#0c0508');
      } else if (idx === 1) {
        grad.addColorStop(0, '#0c1b2e');
        grad.addColorStop(0.5, '#1e3a5f');
        grad.addColorStop(1, '#050a12');
      } else if (idx === 2) {
        grad.addColorStop(0, '#1c0c2e');
        grad.addColorStop(0.5, '#3b185f');
        grad.addColorStop(1, '#080312');
      } else if (idx === 3) {
        grad.addColorStop(0, '#2e190c');
        grad.addColorStop(0.5, '#5f2c18');
        grad.addColorStop(1, '#120803');
      } else {
        grad.addColorStop(0, '#082b20');
        grad.addColorStop(0.5, '#155f48');
        grad.addColorStop(1, '#03120c');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 768);

      // Painting art details
      if (idx === 0) {
        // Red Blood Moon
        ctx.fillStyle = '#ff2244';
        ctx.beginPath();
        ctx.arc(256, 260, 110, 0, Math.PI * 2);
        ctx.fill();

        // Dark gothic castle spires silhouette
        ctx.fillStyle = '#060305';
        ctx.beginPath();
        ctx.moveTo(80, 768);
        ctx.lineTo(80, 420);
        ctx.lineTo(130, 300);
        ctx.lineTo(180, 420);
        ctx.lineTo(230, 450);
        ctx.lineTo(256, 180); // Tall central spire
        ctx.lineTo(282, 450);
        ctx.lineTo(330, 420);
        ctx.lineTo(380, 310);
        ctx.lineTo(430, 430);
        ctx.lineTo(430, 768);
        ctx.closePath();
        ctx.fill();
      } else if (idx === 1) {
        // Knight helmet silhouette with glowing cyan eye slit
        ctx.fillStyle = '#0a101d';
        ctx.beginPath();
        ctx.arc(256, 320, 130, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(150, 320, 212, 280);

        // Glowing visor
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 20;
        ctx.fillRect(190, 310, 132, 18);
        ctx.shadowBlur = 0;
      } else if (idx === 2) {
        // Rune portal circle
        ctx.strokeStyle = '#d946ef';
        ctx.lineWidth = 14;
        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(256, 384, 160, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(256, 384, 110, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (idx === 3) {
        // Golden Gothic Cross & Laurel
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 20;
        ctx.fillRect(236, 180, 40, 360);
        ctx.fillRect(156, 280, 200, 40);
        ctx.shadowBlur = 0;
      } else {
        // Cyber Defrag Winged Crest
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 10;
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(80, 300);
        ctx.lineTo(256, 460);
        ctx.lineTo(432, 300);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Ornate inner canvas border
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
      ctx.lineWidth = 12;
      ctx.strokeRect(20, 20, 472, 728);

      const tex = new THREE.CanvasTexture(c);
      this.paintingsTextures.push(tex);
    });
  }

  // Construct symmetric Castle Citadel: Ground Floor + 2nd Floor with alternative layout & transitions
  private buildLevelGeometry(): void {
    const centerRadius = 600;       // Circular central hall (1,200u diameter)
    const corridorHalfW = 200;      // 400-unit wide corridors
    const ringInnerRadius = 2800;   // Inner boundary of outer circular track (450u wide track)
    const ringOuterRadius = 3250;   // Outer boundary of castle (6,500u diameter)
    const wallH = 400;              // Grand Castle wall & ceiling height
    const floor2Y = 140;            // 2nd floor height level
    const floorSize = 3500;         // Complete floor coverage
    const thick = 20;               // Wall thickness

    // 1. MONUMENTAL CASTLE STONE FLOOR at y = 0
    this.addBox(
      new THREE.Vector3(-floorSize, -20, -floorSize),
      new THREE.Vector3(floorSize, 0, floorSize),
      'floor',
      { repeatX: 70, repeatY: 70 }
    );

    // 1b. Castle Crest Rosette inlaid in center of the rotunda spawn
    const rosetteGroup = createCastleRosetteGroup(200);
    this.scene.add(rosetteGroup);

    // 2. CASTLE STONE CEILING at y = wallH (400)
    this.addBox(
      new THREE.Vector3(-floorSize, wallH, -floorSize),
      new THREE.Vector3(floorSize, wallH + 20, floorSize),
      'stoneWall',
      { repeatX: 70, repeatY: 70 }
    );

    // 3. GRAND OUTER CIRCULAR WALL (R = 3250, height = 400)
    this.addCylinderWall(ringOuterRadius, wallH, 0, Math.PI * 2, 'stoneWall', THREE.BackSide, 80);

    // 4. INNER ROTUNDA ARCS & OUTER RING INNER ARCS (Ground Floor, height = floor2Y)
    const thetaWCenter = Math.asin(corridorHalfW / centerRadius); // ~0.3398 rad
    const thetaLengthCenter = Math.PI * 0.5 - 2 * thetaWCenter;    // ~0.8911 rad

    const thetaWRing = Math.asin(corridorHalfW / ringInnerRadius); // ~0.0715 rad
    const thetaLengthRing = Math.PI * 0.5 - 2 * thetaWRing;        // ~1.4278 rad

    for (let k = 0; k < 4; k++) {
      // Rotunda Inner Arc (y: 0 -> floor2Y)
      const startC = k * Math.PI * 0.5 + thetaWCenter;
      this.addCylinderWall(centerRadius, floor2Y, startC, thetaLengthCenter, 'stoneWall', THREE.DoubleSide, 8);

      // Outer Ring Inner Arc (y: 0 -> floor2Y)
      const startR = k * Math.PI * 0.5 + thetaWRing;
      this.addCylinderWall(ringInnerRadius, floor2Y, startR, thetaLengthRing, 'stoneWall', THREE.DoubleSide, 32);
    }

    // 5. EIGHT STRAIGHT WALLS OF THE 4 CORRIDORS (Ground Floor, height = floor2Y)
    const zStart = Math.sqrt(centerRadius * centerRadius - corridorHalfW * corridorHalfW);       // ~565.69
    const zEnd = Math.sqrt(ringInnerRadius * ringInnerRadius - corridorHalfW * corridorHalfW);   // ~2792.85

    // North Corridor (Z in [-zEnd, -zStart])
    this.addBox(new THREE.Vector3(corridorHalfW, 0, -zEnd), new THREE.Vector3(corridorHalfW + thick, floor2Y, -zStart), 'stoneWall', { repeatX: 24, repeatY: 2 });
    this.addBox(new THREE.Vector3(-corridorHalfW - thick, 0, -zEnd), new THREE.Vector3(-corridorHalfW, floor2Y, -zStart), 'stoneWall', { repeatX: 24, repeatY: 2 });

    // South Corridor (Z in [zStart, zEnd])
    this.addBox(new THREE.Vector3(corridorHalfW, 0, zStart), new THREE.Vector3(corridorHalfW + thick, floor2Y, zEnd), 'stoneWall', { repeatX: 24, repeatY: 2 });
    this.addBox(new THREE.Vector3(-corridorHalfW - thick, 0, zStart), new THREE.Vector3(-corridorHalfW, floor2Y, zEnd), 'stoneWall', { repeatX: 24, repeatY: 2 });

    // East Corridor (X in [zStart, zEnd])
    this.addBox(new THREE.Vector3(zStart, 0, -corridorHalfW - thick), new THREE.Vector3(zEnd, floor2Y, -corridorHalfW), 'stoneWall', { repeatX: 24, repeatY: 2 });
    this.addBox(new THREE.Vector3(zStart, 0, corridorHalfW), new THREE.Vector3(zEnd, floor2Y, corridorHalfW + thick), 'stoneWall', { repeatX: 24, repeatY: 2 });

    // West Corridor (X in [-zEnd, -zStart])
    this.addBox(new THREE.Vector3(-zEnd, 0, -corridorHalfW - thick), new THREE.Vector3(-zStart, floor2Y, -corridorHalfW), 'stoneWall', { repeatX: 24, repeatY: 2 });
    this.addBox(new THREE.Vector3(-zEnd, 0, corridorHalfW), new THREE.Vector3(-zStart, floor2Y, corridorHalfW + thick), 'stoneWall', { repeatX: 24, repeatY: 2 });

    // 6. BUILD 2ND FLOOR (Alternative Layout: Sky Mezzanine, 4 Bastion Cathedrals, Flyovers, Overpasses)
    this.buildSecondFloorGeometry(floor2Y);

    // 7. BUILD FLOOR TRANSITIONS (Speed Ramps, Quake Launch Pads, Grand Stairs)
    this.buildFloorTransitions(floor2Y);

    // 8. DECORATE CITADEL WITH TORCHES & GOTHIC OIL PAINTINGS (Floor 1 + Floor 2)
    this.populateCitadelDecorations(centerRadius, corridorHalfW, ringInnerRadius, ringOuterRadius, zStart, zEnd);
    this.populateSecondFloorDecorations(floor2Y);
  }

  // Construct 2nd floor with distinct layout ("с другой планировкой"):
  // 1. Central Sky Mezzanine & Grand Oculus drop-chasm (over central rotunda)
  // 2. Four expansive Bastion Cathedrals / Sky Sanctuaries (over the 4 outer bastions)
  // 3. Four Diagonal Sky Highways (45 deg angle flyovers connecting Center to Bastions)
  // 4. Four Cross Overpass Bridges (crossing over the 1st floor corridors)
  // 5. Outer Perimeter Sky Deck (connecting outer perimeter on floor 2)
  private buildSecondFloorGeometry(floor2Y: number): void {
    const floorThick = 12;
    const slabMinY = floor2Y - floorThick;
    const slabMaxY = floor2Y;

    // =========================================================================
    // 1. CENTRAL FLOATING SKY MEZZANINE & GRAND OCULUS
    // =========================================================================
    // Over the center rotunda (R=600), we build a floating gallery slab with a center opening (R < 250)
    // The Grand Oculus allows viewing the castle crest rosette below and diving down at high speeds!
    const oculusRadius = 250;
    const mezOuterRadius = 640;

    // 4 Slabs surrounding the Oculus
    // North Mezzanine
    this.addBox(
      new THREE.Vector3(-mezOuterRadius, slabMinY, -mezOuterRadius),
      new THREE.Vector3(mezOuterRadius, slabMaxY, -oculusRadius),
      'floor',
      { repeatX: 12, repeatY: 4 }
    );
    // South Mezzanine
    this.addBox(
      new THREE.Vector3(-mezOuterRadius, slabMinY, oculusRadius),
      new THREE.Vector3(mezOuterRadius, slabMaxY, mezOuterRadius),
      'floor',
      { repeatX: 12, repeatY: 4 }
    );
    // East Mezzanine Wings
    this.addBox(
      new THREE.Vector3(oculusRadius, slabMinY, -oculusRadius),
      new THREE.Vector3(mezOuterRadius, slabMaxY, oculusRadius),
      'floor',
      { repeatX: 4, repeatY: 5 }
    );
    // West Mezzanine Wings
    this.addBox(
      new THREE.Vector3(-mezOuterRadius, slabMinY, -oculusRadius),
      new THREE.Vector3(-oculusRadius, slabMaxY, oculusRadius),
      'floor',
      { repeatX: 4, repeatY: 5 }
    );

    // Glowing Neon Cyan border around the Oculus opening
    this.addBox(new THREE.Vector3(-oculusRadius - 4, slabMaxY, -oculusRadius - 4), new THREE.Vector3(oculusRadius + 4, slabMaxY + 2, -oculusRadius), 'neonCyan');
    this.addBox(new THREE.Vector3(-oculusRadius - 4, slabMaxY, oculusRadius), new THREE.Vector3(oculusRadius + 4, slabMaxY + 2, oculusRadius + 4), 'neonCyan');
    this.addBox(new THREE.Vector3(-oculusRadius - 4, slabMaxY, -oculusRadius), new THREE.Vector3(-oculusRadius, slabMaxY + 2, oculusRadius), 'neonCyan');
    this.addBox(new THREE.Vector3(oculusRadius, slabMaxY, -oculusRadius), new THREE.Vector3(oculusRadius + 4, slabMaxY + 2, oculusRadius), 'neonCyan');

    // 4 Corner Pillars on the Sky Mezzanine
    this.addMonumentalPillar(new THREE.Vector3(-480, floor2Y, -480), 160, 36, true);
    this.addMonumentalPillar(new THREE.Vector3(480, floor2Y, -480), 160, 36, true);
    this.addMonumentalPillar(new THREE.Vector3(-480, floor2Y, 480), 160, 36, true);
    this.addMonumentalPillar(new THREE.Vector3(480, floor2Y, 480), 160, 36, true);

    // =========================================================================
    // 2. FOUR UPPER BASTION CATHEDRALS (The 4 Quarters at y = 140)
    // =========================================================================
    // On the 1st floor, these 4 quadrants were closed bastions.
    // On the 2nd floor, they open into 4 immense open-air halls (2300 x 2300 units each)!
    const bMin = 360;
    const bMax = 2650;

    // NE Bastion Hall (+X, -Z)
    this.addBox(new THREE.Vector3(bMin, slabMinY, -bMax), new THREE.Vector3(bMax, slabMaxY, -bMin), 'floor', { repeatX: 24, repeatY: 24 });
    // NW Bastion Hall (-X, -Z)
    this.addBox(new THREE.Vector3(-bMax, slabMinY, -bMax), new THREE.Vector3(-bMin, slabMaxY, -bMin), 'floor', { repeatX: 24, repeatY: 24 });
    // SE Bastion Hall (+X, +Z)
    this.addBox(new THREE.Vector3(bMin, slabMinY, bMin), new THREE.Vector3(bMax, slabMaxY, bMax), 'floor', { repeatX: 24, repeatY: 24 });
    // SW Bastion Hall (-X, +Z)
    this.addBox(new THREE.Vector3(-bMax, slabMinY, bMin), new THREE.Vector3(-bMin, slabMaxY, bMax), 'floor', { repeatX: 24, repeatY: 24 });

    // Monumental pillars inside each Bastion Hall
    const pillarCoords = [
      { x: 1400, z: -1400 }, { x: 1900, z: -1400 }, { x: 1400, z: -1900 }, { x: 1900, z: -1900 }, // NE
      { x: -1400, z: -1400 }, { x: -1900, z: -1400 }, { x: -1400, z: -1900 }, { x: -1900, z: -1900 }, // NW
      { x: 1400, z: 1400 }, { x: 1900, z: 1400 }, { x: 1400, z: 1900 }, { x: 1900, z: 1900 }, // SE
      { x: -1400, z: 1400 }, { x: -1900, z: 1400 }, { x: -1400, z: 1900 }, { x: -1900, z: 1900 }, // SW
    ];
    pillarCoords.forEach((pt) => {
      this.addMonumentalPillar(new THREE.Vector3(pt.x, floor2Y, pt.z), 180, 42, true);
    });

    // =========================================================================
    // 3. FOUR CROSS OVERPASS BRIDGES (Crossing above 1st floor corridors)
    // =========================================================================
    // Linking the Bastion Halls into a continuous inner ring on Floor 2!
    // North Overpass (connects NW and NE halls above North Corridor)
    this.addBox(new THREE.Vector3(-bMin - 20, slabMinY, -1650), new THREE.Vector3(bMin + 20, slabMaxY, -1250), 'floor', { repeatX: 8, repeatY: 4 });
    this.addBox(new THREE.Vector3(-bMin - 20, slabMaxY, -1656), new THREE.Vector3(bMin + 20, slabMaxY + 2, -1650), 'neonOrange');
    this.addBox(new THREE.Vector3(-bMin - 20, slabMaxY, -1250), new THREE.Vector3(bMin + 20, slabMaxY + 2, -1244), 'neonOrange');

    // South Overpass (connects SW and SE halls above South Corridor)
    this.addBox(new THREE.Vector3(-bMin - 20, slabMinY, 1250), new THREE.Vector3(bMin + 20, slabMaxY, 1650), 'floor', { repeatX: 8, repeatY: 4 });
    this.addBox(new THREE.Vector3(-bMin - 20, slabMaxY, 1244), new THREE.Vector3(bMin + 20, slabMaxY + 2, 1250), 'neonOrange');
    this.addBox(new THREE.Vector3(-bMin - 20, slabMaxY, 1650), new THREE.Vector3(bMin + 20, slabMaxY + 2, 1656), 'neonOrange');

    // East Overpass (connects NE and SE halls above East Corridor)
    this.addBox(new THREE.Vector3(1250, slabMinY, -bMin - 20), new THREE.Vector3(1650, slabMaxY, bMin + 20), 'floor', { repeatX: 4, repeatY: 8 });
    this.addBox(new THREE.Vector3(1244, slabMaxY, -bMin - 20), new THREE.Vector3(1250, slabMaxY + 2, bMin + 20), 'neonOrange');
    this.addBox(new THREE.Vector3(1650, slabMaxY, -bMin - 20), new THREE.Vector3(1656, slabMaxY + 2, bMin + 20), 'neonOrange');

    // West Overpass (connects NW and SW halls above West Corridor)
    this.addBox(new THREE.Vector3(-1650, slabMinY, -bMin - 20), new THREE.Vector3(-1250, slabMaxY, bMin + 20), 'floor', { repeatX: 4, repeatY: 8 });
    this.addBox(new THREE.Vector3(-1656, slabMaxY, -bMin - 20), new THREE.Vector3(-1650, slabMaxY + 2, bMin + 20), 'neonOrange');
    this.addBox(new THREE.Vector3(-1250, slabMaxY, -bMin - 20), new THREE.Vector3(-1244, slabMaxY + 2, bMin + 20), 'neonOrange');

    // =========================================================================
    // 4. FOUR DIAGONAL SKY HIGHWAYS (Flyovers connecting Mezzanine to Bastions)
    // =========================================================================
    // Width 280 units, flying at 45 degree angles across the Citadel
    this.buildDiagonalBridge(new THREE.Vector3(450, floor2Y, -450), new THREE.Vector3(1150, floor2Y, -1150), 280);
    this.buildDiagonalBridge(new THREE.Vector3(-450, floor2Y, -450), new THREE.Vector3(-1150, floor2Y, -1150), 280);
    this.buildDiagonalBridge(new THREE.Vector3(450, floor2Y, 450), new THREE.Vector3(1150, floor2Y, 1150), 280);
    this.buildDiagonalBridge(new THREE.Vector3(-450, floor2Y, 450), new THREE.Vector3(-1150, floor2Y, 1150), 280);

    // =========================================================================
    // 5. OUTER PERIMETER SKY DECK (Circular flyovers along outer ring wall)
    // =========================================================================
    // Outer skybridges across the corridor openings at the perimeter
    this.addBox(new THREE.Vector3(-260, slabMinY, -3150), new THREE.Vector3(260, slabMaxY, -2800), 'floor', { repeatX: 6, repeatY: 4 });
    this.addBox(new THREE.Vector3(2800, slabMinY, -260), new THREE.Vector3(3150, slabMaxY, 260), 'floor', { repeatX: 4, repeatY: 6 });
    this.addBox(new THREE.Vector3(-260, slabMinY, 2800), new THREE.Vector3(260, slabMaxY, 3150), 'floor', { repeatX: 6, repeatY: 4 });
    this.addBox(new THREE.Vector3(-3150, slabMinY, -260), new THREE.Vector3(-2800, slabMaxY, 260), 'floor', { repeatX: 4, repeatY: 6 });
  }

  // Build a seamless diagonal bridge slab and colliders between two points at floor2Y
  private buildDiagonalBridge(start: THREE.Vector3, end: THREE.Vector3, width: number): void {
    const floorThick = 12;
    const slabMinY = start.y - floorThick;
    const slabMaxY = start.y;

    const dir = end.clone().sub(start);
    const length = dir.length();
    const midPoint = start.clone().add(end).multiplyScalar(0.5);

    // Visual Mesh for the diagonal bridge slab
    const bridgeGeo = new THREE.BoxGeometry(width, floorThick, length);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, this.materials['floor']);
    bridgeMesh.position.set(midPoint.x, slabMinY + floorThick * 0.5, midPoint.z);
    bridgeMesh.lookAt(end.x, slabMinY + floorThick * 0.5, end.z);
    bridgeMesh.receiveShadow = true;
    bridgeMesh.castShadow = true;
    this.scene.add(bridgeMesh);

    // Neon edge trims
    const neonGeo = new THREE.BoxGeometry(4, 2, length);
    const neonLeft = new THREE.Mesh(neonGeo, this.materials['neonCyan']);
    const neonRight = new THREE.Mesh(neonGeo, this.materials['neonCyan']);
    const halfW = width * 0.5;
    neonLeft.position.set(-halfW, floorThick * 0.5 + 1, 0);
    neonRight.position.set(halfW, floorThick * 0.5 + 1, 0);
    bridgeMesh.add(neonLeft);
    bridgeMesh.add(neonRight);

    // Discrete overlapping AABB colliders for exact Quake collision
    const numSteps = 7;
    const stepVec = dir.clone().divideScalar(numSteps);
    const boxSize = width * 1.05;
    const halfBox = boxSize * 0.5;

    for (let i = 0; i <= numSteps; i++) {
      const p = start.clone().addScaledVector(stepVec, i);
      this.collisionWorld.boxes.push({
        type: 'box',
        min: new THREE.Vector3(p.x - halfBox, slabMinY, p.z - halfBox),
        max: new THREE.Vector3(p.x + halfBox, slabMaxY, p.z + halfBox)
      });
    }
  }

  // Construct all transitions to Floor 2:
  // 1. High-speed ascending ramps (North & South)
  // 2. High-impulse Quake Launch Pads (East, West & Rotunda)
  // 3. Grand cascading stairways (NW & SE)
  private buildFloorTransitions(floor2Y: number): void {
    // -------------------------------------------------------------------------
    // 1. NORTH & SOUTH SPEED RAMPS (Smooth ~13 deg ascent for bunnyhop preservation)
    // -------------------------------------------------------------------------
    // North Ramp: ascends from z = -800 (y = 0) to z = -1400 (y = 140)
    // Width 180 (placed on left side of corridor, x in [-180, 0])
    // Leaving x in [10, 190] completely open for 1st-floor high-speed traffic!
    this.addRamp(
      new THREE.Vector3(-90, 0, -800),
      new THREE.Vector3(-90, floor2Y, -1400),
      180
    );

    // South Ramp: ascends from z = 800 (y = 0) to z = 1400 (y = 140)
    // Width 180 (placed on right side of corridor, x in [0, 180])
    // Leaving x in [-190, -10] completely open!
    this.addRamp(
      new THREE.Vector3(90, 0, 800),
      new THREE.Vector3(90, floor2Y, 1400),
      180
    );

    // -------------------------------------------------------------------------
    // 2. QUAKE LAUNCH PADS (Dynamic Jump Pads)
    // -------------------------------------------------------------------------
    // East Launch Pad: shoots player up and forward onto the East Overpass Bridge at (1450, 140, 0)
    this.addLaunchPad(
      new THREE.Vector3(960, 0, -60),
      new THREE.Vector3(1080, 6, 60),
      new THREE.Vector3(450, 530, 0)
    );

    // West Launch Pad: shoots player onto West Overpass Bridge at (-1450, 140, 0)
    this.addLaunchPad(
      new THREE.Vector3(-1080, 0, -60),
      new THREE.Vector3(-960, 6, 60),
      new THREE.Vector3(-450, 530, 0)
    );

    // Rotunda Jump Pads: launch player upwards onto the Central Sky Mezzanine!
    this.addLaunchPad(
      new THREE.Vector3(320, 0, 320),
      new THREE.Vector3(420, 6, 420),
      new THREE.Vector3(-140, 560, -140)
    );
    this.addLaunchPad(
      new THREE.Vector3(-420, 0, -420),
      new THREE.Vector3(-320, 6, -320),
      new THREE.Vector3(140, 560, 140)
    );

    // -------------------------------------------------------------------------
    // 3. GRAND CASCADING STAIRWAYS (Stepped terraces with steps <= 14 units)
    // -------------------------------------------------------------------------
    // Stairway 1: Ascent into NW Bastion Hall from North Corridor (z = -2000)
    this.addSteppedStairs(
      new THREE.Vector3(-190, 0, -2000),
      new THREE.Vector3(-550, floor2Y, -2000),
      220,
      10
    );

    // Stairway 2: Ascent into SE Bastion Hall from South Corridor (z = 2000)
    this.addSteppedStairs(
      new THREE.Vector3(190, 0, 2000),
      new THREE.Vector3(550, floor2Y, 2000),
      220,
      10
    );
  }

  // Populate torches and oil paintings across the 2nd floor galleries
  private populateSecondFloorDecorations(floor2Y: number): void {
    let paintingIdx = 1;
    const eyeH = floor2Y + 65; // Eye height on floor 2: 205

    // 1. Torches and paintings along outer wall at floor 2 height
    const numOuterSpots = 16;
    const ringOuterRadius = 3250;
    for (let i = 0; i < numOuterSpots; i++) {
      const a = (i * Math.PI * 2) / numOuterSpots;
      const x = Math.sin(a) * (ringOuterRadius - 12);
      const z = Math.cos(a) * (ringOuterRadius - 12);
      const yaw = Math.atan2(-x, -z);

      if (i % 2 === 0) {
        this.addWallTorch(new THREE.Vector3(x, eyeH, z), yaw, i % 4 === 0);
      } else {
        this.addWallPainting(new THREE.Vector3(x, eyeH, z), yaw, paintingIdx++);
      }
    }
  }

  // Populate torches and oil paintings throughout rotunda, corridors and outer ring
  private populateCitadelDecorations(
    centerRadius: number,
    corridorHalfW: number,
    ringInnerRadius: number,
    ringOuterRadius: number,
    zStart: number,
    zEnd: number
  ): void {
    let paintingIdx = 0;

    // 1. Central Rotunda Walls: 3 items on each of the 4 arcs
    for (let k = 0; k < 4; k++) {
      const midAngle = k * Math.PI * 0.5 + Math.PI * 0.25;
      const angleOffsets = [-0.18, 0, 0.18];
      angleOffsets.forEach((off, idx) => {
        const a = midAngle + off;
        const x = Math.sin(a) * (centerRadius - 8);
        const z = Math.cos(a) * (centerRadius - 8);
        const yaw = Math.atan2(-x, -z);

        if (idx === 1) {
          // Central torch on each rotunda arc with PointLight
          this.addWallTorch(new THREE.Vector3(x, 65, z), yaw, true);
        } else if (idx === 0) {
          this.addWallTorch(new THREE.Vector3(x, 65, z), yaw, false);
        } else {
          this.addWallPainting(new THREE.Vector3(x, 65, z), yaw, paintingIdx++);
        }
      });
    }

    // 2. Corridors: Torches & paintings along each straight wall
    const corridorStep = 280;
    const corridorPositions: number[] = [];
    for (let pos = zStart + 180; pos <= zEnd - 180; pos += corridorStep) {
      corridorPositions.push(pos);
    }

    corridorPositions.forEach((pos, idx) => {
      const isTorch = idx % 2 === 0;
      const withLight = idx === 3; // 1 PointLight per corridor side

      // North Corridor
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(corridorHalfW - 6, 65, -pos), -Math.PI * 0.5, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(corridorHalfW - 6, 65, -pos), -Math.PI * 0.5, paintingIdx++);
      }
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(-corridorHalfW + 6, 65, -pos), Math.PI * 0.5, false);
      } else {
        this.addWallPainting(new THREE.Vector3(-corridorHalfW + 6, 65, -pos), Math.PI * 0.5, paintingIdx++);
      }

      // South Corridor
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(corridorHalfW - 6, 65, pos), -Math.PI * 0.5, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(corridorHalfW - 6, 65, pos), -Math.PI * 0.5, paintingIdx++);
      }
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(-corridorHalfW + 6, 65, pos), Math.PI * 0.5, false);
      } else {
        this.addWallPainting(new THREE.Vector3(-corridorHalfW + 6, 65, pos), Math.PI * 0.5, paintingIdx++);
      }

      // East Corridor
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(pos, 65, -corridorHalfW + 6), 0, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(pos, 65, -corridorHalfW + 6), 0, paintingIdx++);
      }
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(pos, 65, corridorHalfW - 6), Math.PI, false);
      } else {
        this.addWallPainting(new THREE.Vector3(pos, 65, corridorHalfW - 6), Math.PI, paintingIdx++);
      }

      // West Corridor
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(-pos, 65, -corridorHalfW + 6), 0, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(-pos, 65, -corridorHalfW + 6), 0, paintingIdx++);
      }
      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(-pos, 65, corridorHalfW - 6), Math.PI, false);
      } else {
        this.addWallPainting(new THREE.Vector3(-pos, 65, corridorHalfW - 6), Math.PI, paintingIdx++);
      }
    });

    // 3. Outer Ring: Torches and paintings along grand outer circular wall
    const numOuterSpots = 24;
    for (let i = 0; i < numOuterSpots; i++) {
      const a = (i * Math.PI * 2) / numOuterSpots;
      const x = Math.sin(a) * (ringOuterRadius - 12);
      const z = Math.cos(a) * (ringOuterRadius - 12);
      const yaw = Math.atan2(-x, -z);

      const isTorch = i % 2 === 0;
      const withLight = i % 4 === 0; // 8 PointLights distributed around the outer ring

      if (isTorch) {
        this.addWallTorch(new THREE.Vector3(x, 65, z), yaw, withLight);
      } else {
        this.addWallPainting(new THREE.Vector3(x, 65, z), yaw, paintingIdx++);
      }
    }

    // 4. Outer Ring: Torches along inner arc walls of bastions
    for (let k = 0; k < 4; k++) {
      const midAngle = k * Math.PI * 0.5 + Math.PI * 0.25;
      const offsets = [-0.35, -0.12, 0.12, 0.35];
      offsets.forEach((off, idx) => {
        const a = midAngle + off;
        const x = Math.sin(a) * (ringInnerRadius + 12);
        const z = Math.cos(a) * (ringInnerRadius + 12);
        const yaw = Math.atan2(x, z);

        if (idx % 2 === 0) {
          this.addWallTorch(new THREE.Vector3(x, 65, z), yaw, false);
        } else {
          this.addWallPainting(new THREE.Vector3(x, 65, z), yaw, paintingIdx++);
        }
      });
    }
  }

  // Helper to add cylindrical wall arcs
  private addCylinderWall(
    radius: number,
    height: number,
    thetaStart: number,
    thetaLength: number,
    materialKey: string,
    side: THREE.Side = THREE.DoubleSide,
    uvRepeatX: number = 8,
    baseY: number = 0
  ): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(
      radius,
      radius,
      height,
      Math.max(16, Math.floor(thetaLength * 28)),
      1,
      true,
      thetaStart,
      thetaLength
    );
    let mat = this.materials[materialKey] || this.materials['stoneWall'];
    if (mat instanceof THREE.MeshStandardMaterial) {
      const cloned = mat.clone();
      cloned.side = side;
      if (cloned.map) {
        cloned.map = cloned.map.clone();
        cloned.map.repeat.set(uvRepeatX, Math.max(1, Math.round(height / 80)));
        cloned.map.needsUpdate = true;
      }
      mat = cloned;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, baseY + height * 0.5, 0);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  // Add 3D Medieval Torch with animated flame & optional flickering PointLight
  public addWallTorch(pos: THREE.Vector3, yawAngle: number, withLight: boolean = true): void {
    const torchGroup = new THREE.Group();
    torchGroup.position.copy(pos);
    torchGroup.rotation.y = yawAngle;

    // 1. Metal wall mount bracket
    const bracketGeo = new THREE.BoxGeometry(4, 8, 8);
    const bracketMesh = new THREE.Mesh(bracketGeo, this.materials['ironTorch']);
    bracketMesh.position.set(0, 0, -4);
    torchGroup.add(bracketMesh);

    // 2. Angled torch wooden handle
    const handleGeo = new THREE.CylinderGeometry(1.5, 1.2, 18, 8);
    const handleMesh = new THREE.Mesh(handleGeo, this.materials['woodTorch']);
    handleMesh.rotation.x = Math.PI / 6;
    handleMesh.position.set(0, 4, 3);
    torchGroup.add(handleMesh);

    // 3. Iron bowl / cage
    const bowlGeo = new THREE.CylinderGeometry(3.5, 2.0, 5, 8);
    const bowlMesh = new THREE.Mesh(bowlGeo, this.materials['ironTorch']);
    bowlMesh.position.set(0, 11, 7);
    torchGroup.add(bowlMesh);

    // 4. Glowing 3D Flame Mesh
    const flameGeo = new THREE.ConeGeometry(2.8, 8, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const flameMesh = new THREE.Mesh(flameGeo, flameMat);
    flameMesh.position.set(0, 16, 7);
    torchGroup.add(flameMesh);

    // Inner bright core
    const coreGeo = new THREE.ConeGeometry(1.5, 5, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0aa });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 15, 7);
    torchGroup.add(coreMesh);

    // 5. Optional Flickering Torch PointLight
    let torchLight: THREE.PointLight | undefined;
    if (withLight) {
      torchLight = new THREE.PointLight(0xff7722, 1.8, 300, 1.2);
      torchLight.position.set(0, 18, 10);
      torchGroup.add(torchLight);
    }

    this.scene.add(torchGroup);

    this.torches.push({
      light: torchLight,
      flameMesh: flameMesh,
      baseIntensity: 1.8,
      flickerSpeed: 8 + Math.random() * 6,
      seed: Math.random() * 100
    });
  }

  // Add ornate framed painting on wall
  public addWallPainting(pos: THREE.Vector3, yawAngle: number, paintingIndex: number): void {
    const pGroup = new THREE.Group();
    pGroup.position.copy(pos);
    pGroup.rotation.y = yawAngle;

    const width = 36;
    const height = 52;
    const frameDepth = 3.5;

    // Outer Gold/Wood Frame
    const frameGeo = new THREE.BoxGeometry(width + 6, height + 6, frameDepth);
    const frameMesh = new THREE.Mesh(frameGeo, this.materials['goldFrame']);
    pGroup.add(frameMesh);

    // Canvas surface with oil painting texture
    const tex = this.paintingsTextures[paintingIndex % this.paintingsTextures.length];
    const canvasMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      metalness: 0.1
    });

    const canvasGeo = new THREE.PlaneGeometry(width, height);
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.set(0, 0, frameDepth * 0.5 + 0.1);
    pGroup.add(canvasMesh);

    this.scene.add(pGroup);
  }

  // Update animated torch flames and lights every frame
  public update(time: number): void {
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      // Organic fire flicker
      const flicker = Math.sin(time * t.flickerSpeed + t.seed) * 0.25 +
                      Math.cos(time * t.flickerSpeed * 1.7 + t.seed) * 0.15;
      if (t.light) {
        t.light.intensity = t.baseIntensity + flicker;
      }

      // Flame scale animation
      const scaleY = 1.0 + flicker * 0.35;
      const scaleXZ = 1.0 - flicker * 0.15;
      t.flameMesh.scale.set(scaleXZ, scaleY, scaleXZ);
    }
  }

  // Add an axis-aligned box with collision and mesh
  private addBox(
    min: THREE.Vector3,
    max: THREE.Vector3,
    materialKey: string,
    uvRepeat?: { repeatX: number; repeatY: number }
  ): void {
    const size = new THREE.Vector3(max.x - min.x, max.y - min.y, max.z - min.z);
    const center = new THREE.Vector3((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);

    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);

    let mat = this.materials[materialKey] || this.materials['wall'];
    if (uvRepeat && mat instanceof THREE.MeshStandardMaterial) {
      const clonedMat = mat.clone();
      if (clonedMat.map) {
        clonedMat.map = clonedMat.map.clone();
        clonedMat.map.repeat.set(uvRepeat.repeatX, uvRepeat.repeatY);
        clonedMat.map.needsUpdate = true;
      }
      if (clonedMat.normalMap) {
        clonedMat.normalMap = clonedMat.normalMap.clone();
        clonedMat.normalMap.repeat.set(uvRepeat.repeatX, uvRepeat.repeatY);
        clonedMat.normalMap.needsUpdate = true;
      }
      if (clonedMat.roughnessMap) {
        clonedMat.roughnessMap = clonedMat.roughnessMap.clone();
        clonedMat.roughnessMap.repeat.set(uvRepeat.repeatX, uvRepeat.repeatY);
        clonedMat.roughnessMap.needsUpdate = true;
      }
      mat = clonedMat;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.collisionWorld.boxes.push({
      type: 'box',
      min: min.clone(),
      max: max.clone()
    });
  }



  // Add an angled ramp collider and visual mesh (supports any horizontal orientation)
  public addRamp(start: THREE.Vector3, end: THREE.Vector3, width: number): void {
    const dir = end.clone().sub(start);
    const length = dir.length();
    const hDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const across = new THREE.Vector3(-hDir.z, 0, hDir.x).normalize();
    const halfW = width * 0.5;

    // Normal to ramp plane pointing upwards
    const normal = new THREE.Vector3().crossVectors(across, dir).normalize();
    if (normal.y < 0) normal.negate();

    const planeConstant = normal.dot(start);

    // Compute bounding rectangle in XZ plane
    const p1 = start.clone().addScaledVector(across, -halfW);
    const p2 = start.clone().addScaledVector(across, halfW);
    const p3 = end.clone().addScaledVector(across, -halfW);
    const p4 = end.clone().addScaledVector(across, halfW);

    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minZ = Math.min(p1.z, p2.z, p3.z, p4.z);
    const maxZ = Math.max(p1.z, p2.z, p3.z, p4.z);

    // Visual Mesh for ramp surface
    const rampGeo = new THREE.BoxGeometry(width, 6, length);
    const rampMesh = new THREE.Mesh(rampGeo, this.materials['ramp']);
    const midPoint = start.clone().add(end).multiplyScalar(0.5);
    rampMesh.position.copy(midPoint);
    rampMesh.lookAt(end.x, end.y, end.z);
    rampMesh.rotateX(Math.PI / 2);
    rampMesh.receiveShadow = true;
    rampMesh.castShadow = true;
    this.scene.add(rampMesh);

    // Solid stone support underneath the ramp
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const heightDiff = maxY - minY;
    if (heightDiff > 4) {
      const supportGeo = new THREE.BoxGeometry(width * 0.98, heightDiff, length * 0.98);
      const supportMesh = new THREE.Mesh(supportGeo, this.materials['stoneWall']);
      supportMesh.position.set(midPoint.x, minY + heightDiff * 0.5 - 3, midPoint.z);
      supportMesh.lookAt(end.x, minY + heightDiff * 0.5 - 3, end.z);
      supportMesh.rotateX(Math.PI / 2);
      this.scene.add(supportMesh);
    }

    this.collisionWorld.ramps.push({
      type: 'ramp',
      start: start.clone(),
      end: end.clone(),
      minX,
      maxX,
      minZ,
      maxZ,
      normal: normal.clone(),
      planeNormal: normal.clone(),
      planeConstant
    });
  }

  // Add cascading stair terraces (steps <= 14 units tall for smooth Quake step-up)
  public addSteppedStairs(start: THREE.Vector3, end: THREE.Vector3, width: number, numSteps: number): void {
    const stepDelta = end.clone().sub(start).divideScalar(numSteps);
    const hDir = new THREE.Vector3(stepDelta.x, 0, stepDelta.z).normalize();
    const across = new THREE.Vector3(-hDir.z, 0, hDir.x).normalize();
    const halfW = width * 0.5;

    for (let i = 0; i < numSteps; i++) {
      const pStart = start.clone().addScaledVector(stepDelta, i);
      const pEnd = start.clone().addScaledVector(stepDelta, i + 1);
      const stepY = pEnd.y;

      const p1 = pStart.clone().addScaledVector(across, -halfW);
      const p2 = pStart.clone().addScaledVector(across, halfW);
      const p3 = pEnd.clone().addScaledVector(across, -halfW);
      const p4 = pEnd.clone().addScaledVector(across, halfW);

      const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
      const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
      const minZ = Math.min(p1.z, p2.z, p3.z, p4.z);
      const maxZ = Math.max(p1.z, p2.z, p3.z, p4.z);

      this.addBox(
        new THREE.Vector3(minX, 0, minZ),
        new THREE.Vector3(maxX, stepY, maxZ),
        'stoneWall',
        { repeatX: 4, repeatY: 1 }
      );
    }
  }

  // Add a monumental stone pillar with capital and torch
  public addMonumentalPillar(pos: THREE.Vector3, height: number, size: number = 36, withTorch: boolean = true): void {
    const halfS = size * 0.5;
    // Base & Shaft
    this.addBox(
      new THREE.Vector3(pos.x - halfS, pos.y, pos.z - halfS),
      new THREE.Vector3(pos.x + halfS, pos.y + height, pos.z + halfS),
      'stoneWall',
      { repeatX: 1, repeatY: 3 }
    );
    // Capital trim
    const capSize = size + 10;
    const halfCap = capSize * 0.5;
    this.addBox(
      new THREE.Vector3(pos.x - halfCap, pos.y + height - 8, pos.z - halfCap),
      new THREE.Vector3(pos.x + halfCap, pos.y + height, pos.z + halfCap),
      'pillar'
    );

    if (withTorch) {
      // Add torch at eye height relative to pillar base
      this.addWallTorch(new THREE.Vector3(pos.x, pos.y + 55, pos.z + halfS + 4), 0, true);
    }
  }

  // Add an interactive launch pad
  public addLaunchPad(min: THREE.Vector3, max: THREE.Vector3, boostVelocity: THREE.Vector3): void {
    const size = new THREE.Vector3(max.x - min.x, max.y - min.y, max.z - min.z);
    const center = new THREE.Vector3((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);

    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geo, this.materials['launchpad']);
    mesh.position.copy(center);
    this.scene.add(mesh);

    this.collisionWorld.triggers.push({
      type: 'launchpad',
      min: min.clone(),
      max: new THREE.Vector3(max.x, max.y + 15, max.z),
      boostVelocity: boostVelocity.clone()
    });

    this.collisionWorld.boxes.push({
      type: 'box',
      min: min.clone(),
      max: max.clone()
    });
  }
}
