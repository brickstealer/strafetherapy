import * as THREE from 'three';
import type { UserInput, PlayerState, BoxCollider, RampCollider, TriggerZone } from '../types';

export interface CastleMapBounds {
  centerRadius: number;
  corridorHalfWidth: number;
  ringInnerRadius: number;
  ringOuterRadius: number;
  floor2Height?: number;
}

export interface CollisionWorld {
  boxes: BoxCollider[];
  ramps: RampCollider[];
  triggers: TriggerZone[];
  castleBounds?: CastleMapBounds;
}

export interface PmoveCallbacks {
  onJump?: () => void;
  onLand?: (impactSpeed: number) => void;
  onLaunchPad?: (velocity: THREE.Vector3) => void;
  onHazard?: (respawnPoint: THREE.Vector3, respawnYaw: number) => void;
  onMilestone?: (stage: number) => void;
  onWallHit?: (lossSpeed: number) => void;
}

export class Pmove {
  // Classic Quake / CPMA Movement Constants
  public static readonly GRAVITY = 800.0;
  public static readonly STOP_SPEED = 100.0;
  public static readonly GROUND_FRICTION = 6.0;
  public static readonly MAX_WALK_SPEED = 320.0;
  public static readonly GROUND_ACCEL = 10.0;
  public static readonly AIR_ACCEL = 70.0;
  public static readonly AIR_WISH_SPEED = 32.0;
  public static readonly JUMP_VELOCITY = 270.0;
  public static readonly CPM_AIR_CONTROL = 140.0;
  public static readonly STEP_SIZE = 18.0;

  // Player Bounding Box dimensions (Quake standard)
  public static readonly PLAYER_RADIUS = 15.0; // Half-width (30x30 bounding box)
  public static readonly PLAYER_HEIGHT = 56.0; // Total height
  public static readonly EYE_HEIGHT = 48.0;    // Camera offset from base

  // Fixed Physics Tick: 125 Hz (0.008s) Quake standard
  public static readonly FIXED_DT = 1.0 / 125.0;

  public state: PlayerState;
  public world: CollisionWorld;
  public callbacks: PmoveCallbacks = {};

  // Milestone tracking (500, 750, 1000, 1250, 1500)
  private milestoneThresholds = [500, 750, 1000, 1250, 1500];
  private passedMilestones = new Set<number>();

  // Speed multiplier
  private speedMultiplier = 1.0;

  // Temporary vectors
  private tempVec1 = new THREE.Vector3();

  constructor(initialPosition: THREE.Vector3, world: CollisionWorld) {
    this.world = world;
    this.state = {
      position: initialPosition.clone(),
      velocity: new THREE.Vector3(0, 0, 0),
      yaw: 0,
      pitch: 0,
      roll: 0,
      isGrounded: false,
      groundNormal: new THREE.Vector3(0, 1, 0),
      jumpQueued: false,
      horizontalSpeed: 0,
      totalSpeed: 0,
      lastGroundTime: 0,
      airTime: 0
    };
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.1, multiplier);
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  // Set spawn/teleport position
  public setPosition(pos: THREE.Vector3, yaw?: number): void {
    this.state.position.copy(pos);
    this.state.velocity.set(0, 0, 0);
    this.state.isGrounded = false;
    if (yaw !== undefined) {
      this.state.yaw = yaw;
    }
  }

  // Apply explosion blast impulse (Rocket Jumping and knockback)
  public applyExplosionImpulse(origin: THREE.Vector3, force: number = 800, radius: number = 280): void {
    const playerCenter = this.state.position.clone();
    playerCenter.y += Pmove.PLAYER_HEIGHT * 0.4;
    const diff = playerCenter.clone().sub(origin);
    const dist = diff.length();
    if (dist >= radius) return;

    const factor = Math.max(0.2, 1.0 - (dist / radius));
    // Upward bias for high-flying Quake rocket jumps
    diff.y += 24;
    if (diff.lengthSq() < 0.001) {
      diff.set(0, 1, 0);
    } else {
      diff.normalize();
    }

    const impulseMag = force * factor * this.speedMultiplier;
    this.state.velocity.addScaledVector(diff, impulseMag);
    this.state.isGrounded = false;
  }

  // Core Fixed-Tick Physics Loop (pmove step)
  public tick(input: UserInput, dt: number = Pmove.FIXED_DT): void {
    // 1. Calculate Wish Direction in World Space from View Yaw & Keys
    const wishDir = this.getWishDirection(input);
    const hasWish = wishDir.lengthSq() > 0.0001;

    // 2. Check Ground State
    const wasGrounded = this.state.isGrounded;
    this.checkGrounded();

    if (this.state.isGrounded && !wasGrounded) {
      const landingImpact = Math.abs(this.state.velocity.y);
      if (landingImpact > 100 && this.callbacks.onLand) {
        this.callbacks.onLand(landingImpact);
      }
      this.state.airTime = 0;
    } else if (!this.state.isGrounded) {
      this.state.airTime += dt;
    }

    // 3. Auto-Bunnyhop: If Space is held and player is on the ground, IMMEDIATELY JUMP!
    // Bypasses ground friction completely, carrying momentum into next hop!
    if (input.jump && this.state.isGrounded) {
      this.state.velocity.y = Pmove.JUMP_VELOCITY;
      this.state.isGrounded = false;
      this.state.groundNormal.set(0, 1, 0);
      if (this.callbacks.onJump) {
        this.callbacks.onJump();
      }
    }

    // 4. Movement: Ground vs Air
    if (this.state.isGrounded) {
      this.groundMove(wishDir, hasWish, dt);
    } else {
      this.airMove(wishDir, hasWish, input, dt);
    }

    // 5. Kinematic World Collision & Movement Execution
    this.executeMovement(dt);

    // 6. Check Triggers (Launch pads, Hazard chasms, Checkpoints)
    this.checkTriggers();

    // 7. Update Speed Metrics & Speed Milestones
    this.updateSpeedMetrics();
  }

  // Calculate wish direction from WASD and Yaw
  private getWishDirection(input: UserInput): THREE.Vector3 {
    let forwardMove = 0;
    let rightMove = 0;

    if (input.forward) forwardMove += 1;
    if (input.backward) forwardMove -= 1;
    if (input.right) rightMove += 1;
    if (input.left) rightMove -= 1;

    if (forwardMove === 0 && rightMove === 0) {
      return this.tempVec1.set(0, 0, 0);
    }

    // View direction on the horizontal plane (Y-up)
    // Yaw: 0 is -Z, PI/2 is +X, PI is +Z, 3PI/2 is -X
    const cosYaw = Math.cos(this.state.yaw);
    const sinYaw = Math.sin(this.state.yaw);

    const fwdX = -sinYaw;
    const fwdZ = -cosYaw;

    const rightX = cosYaw;
    const rightZ = -sinYaw;

    const wishX = fwdX * forwardMove + rightX * rightMove;
    const wishZ = fwdZ * forwardMove + rightZ * rightMove;

    const len = Math.hypot(wishX, wishZ);
    if (len > 0.0001) {
      return this.tempVec1.set(wishX / len, 0, wishZ / len);
    }
    return this.tempVec1.set(0, 0, 0);
  }

  // Quake Ground Movement: standard ground friction + ground acceleration
  private groundMove(wishDir: THREE.Vector3, hasWish: boolean, dt: number): void {
    // Ground Friction
    const speed = Math.hypot(this.state.velocity.x, this.state.velocity.z);
    if (speed > 0.0001) {
      const stopSpeed = Pmove.STOP_SPEED * this.speedMultiplier;
      const control = speed < stopSpeed ? stopSpeed : speed;
      const drop = control * Pmove.GROUND_FRICTION * dt;
      const newSpeed = Math.max(0, speed - drop);
      if (newSpeed !== speed) {
        const factor = newSpeed / speed;
        this.state.velocity.x *= factor;
        this.state.velocity.z *= factor;
      }
    }

    // Ground Acceleration
    if (hasWish) {
      const wishSpeed = Pmove.MAX_WALK_SPEED * this.speedMultiplier;
      const currentSpeed = this.state.velocity.x * wishDir.x + this.state.velocity.z * wishDir.z;
      const addSpeed = wishSpeed - currentSpeed;

      if (addSpeed > 0) {
        const accelSpeed = Math.min(Pmove.GROUND_ACCEL * wishSpeed * dt, addSpeed);
        this.state.velocity.x += wishDir.x * accelSpeed;
        this.state.velocity.z += wishDir.z * accelSpeed;
      }
    }

    // Zero out downward velocity on ground
    if (this.state.velocity.y < 0) {
      this.state.velocity.y = 0;
    }
  }

  // CPMA Air Movement: AirAccelerate + CPM_AirControl + W-Key Penalization
  private airMove(wishDir: THREE.Vector3, hasWish: boolean, input: UserInput, dt: number): void {
    // 1. Gravity
    this.state.velocity.y -= Pmove.GRAVITY * dt;

    if (!hasWish) return;

    const horizSpeed = Math.hypot(this.state.velocity.x, this.state.velocity.z);

    // 2. CPMA Air-Control (Anarki / CPM Magic): Rotates velocity vector towards wishDir without speed loss
    if (horizSpeed > 10.0 * this.speedMultiplier) {
      this.cpmAirControl(wishDir, horizSpeed, dt);
    }

    // 3. AirAccelerate: wishspeed capped (typically 30-32 u/s) with high sv_airaccelerate (70-100)
    let wishSpeed = Pmove.AIR_WISH_SPEED * this.speedMultiplier;

    // W-key penalty in mid-air: holding pure W doesn't gain strafe speed boost
    if (input.forward && !input.left && !input.right) {
      wishSpeed = Math.min(wishSpeed, 30.0 * this.speedMultiplier);
    }

    const currentSpeed = this.state.velocity.x * wishDir.x + this.state.velocity.z * wishDir.z;
    const addSpeed = wishSpeed - currentSpeed;

    if (addSpeed > 0) {
      const accelSpeed = Math.min(Pmove.AIR_ACCEL * wishSpeed * dt, addSpeed);
      this.state.velocity.x += wishDir.x * accelSpeed;
      this.state.velocity.z += wishDir.z * accelSpeed;
    }
  }

  // CPMA Air Control: Rotates horizontal velocity vector towards wishDir without losing speed
  private cpmAirControl(wishDir: THREE.Vector3, horizSpeed: number, dt: number): void {
    if (wishDir.lengthSq() < 0.001) return;

    const curDirX = this.state.velocity.x / horizSpeed;
    const curDirZ = this.state.velocity.z / horizSpeed;
    const dot = curDirX * wishDir.x + curDirZ * wishDir.z;

    if (dot > 0) {
      const k = 32.0 * (Pmove.CPM_AIR_CONTROL * this.speedMultiplier) * dot * dot * dt;
      const newX = this.state.velocity.x + wishDir.x * k;
      const newZ = this.state.velocity.z + wishDir.z * k;
      const newLen = Math.hypot(newX, newZ);

      if (newLen > 0.0001) {
        this.state.velocity.x = (newX / newLen) * horizSpeed;
        this.state.velocity.z = (newZ / newLen) * horizSpeed;
      }
    }
  }

  // Find ground height and normal at position
  private getGroundAt(x: number, z: number, currentY: number): { groundY: number; normal: THREE.Vector3 } | null {
    const r = Pmove.PLAYER_RADIUS * 0.85;
    let highestY = -Infinity;
    let foundNormal = new THREE.Vector3(0, 1, 0);
    let found = false;

    // Check boxes
    for (const box of this.world.boxes) {
      if (
        x + r >= box.min.x &&
        x - r <= box.max.x &&
        z + r >= box.min.z &&
        z - r <= box.max.z
      ) {
        const topY = box.max.y;
        // Within reasonable vertical step range
        if (topY <= currentY + Pmove.STEP_SIZE + 2 && topY >= currentY - 24) {
          if (topY > highestY) {
            highestY = topY;
            found = true;
            foundNormal.set(0, 1, 0);
          }
        }
      }
    }

    // Check ramps
    for (const ramp of this.world.ramps) {
      if (
        x + r >= ramp.minX &&
        x - r <= ramp.maxX &&
        z + r >= ramp.minZ &&
        z - r <= ramp.maxZ
      ) {
        if (Math.abs(ramp.planeNormal.y) > 0.001) {
          const rampY = (ramp.planeConstant - ramp.planeNormal.x * x - ramp.planeNormal.z * z) / ramp.planeNormal.y;
          if (rampY <= currentY + Pmove.STEP_SIZE + 8 && rampY >= currentY - 36) {
            if (rampY > highestY) {
              highestY = rampY;
              found = true;
              foundNormal.copy(ramp.planeNormal);
            }
          }
        }
      }
    }

    if (found) {
      return { groundY: highestY, normal: foundNormal };
    }
    return null;
  }

  // Check grounded state
  private checkGrounded(): void {
    if (this.state.velocity.y > 0.001) {
      this.state.isGrounded = false;
      return;
    }

    const ground = this.getGroundAt(this.state.position.x, this.state.position.z, this.state.position.y);
    if (ground && Math.abs(this.state.position.y - ground.groundY) <= 5.0 && ground.normal.y >= 0.65) {
      this.state.isGrounded = true;
      this.state.groundNormal.copy(ground.normal);
      this.state.position.y = ground.groundY;
      if (this.state.velocity.y < 0) this.state.velocity.y = 0;
    } else {
      this.state.isGrounded = false;
    }
  }

  // Robust Kinematic Movement Execution
  private executeMovement(dt: number): void {
    const p = this.state.position;
    const v = this.state.velocity;
    const r = Pmove.PLAYER_RADIUS;
    const h = Pmove.PLAYER_HEIGHT;

    if (this.state.isGrounded) {
      // ------------------------------------
      // GROUND MOVEMENT (Horizontal slide against walls + step down)
      // ------------------------------------
      let moveX = v.x * dt;
      let moveZ = v.z * dt;

      // Wall collision test
      for (const box of this.world.boxes) {
        // Only colliders tall enough to be walls (above step height)
        const isWall = box.max.y > p.y + Pmove.STEP_SIZE && box.min.y < p.y + h;
        if (!isWall) continue;

        // Expanded horizontal bounds
        const minX = box.min.x - r;
        const maxX = box.max.x + r;
        const minZ = box.min.z - r;
        const maxZ = box.max.z + r;

        // Check X movement
        if (p.z > minZ && p.z < maxZ) {
          const nextX = p.x + moveX;
          if (p.x <= minX && nextX > minX) {
            moveX = Math.max(0, minX - p.x);
            v.x = 0;
          } else if (p.x >= maxX && nextX < maxX) {
            moveX = Math.min(0, maxX - p.x);
            v.x = 0;
          }
        }

        // Check Z movement
        if (p.x + moveX > minX && p.x + moveX < maxX) {
          const nextZ = p.z + moveZ;
          if (p.z <= minZ && nextZ > minZ) {
            moveZ = Math.max(0, minZ - p.z);
            v.z = 0;
          } else if (p.z >= maxZ && nextZ < maxZ) {
            moveZ = Math.min(0, maxZ - p.z);
            v.z = 0;
          }
        }
      }

      p.x += moveX;
      p.z += moveZ;

      // Snap to ground/ramp
      const ground = this.getGroundAt(p.x, p.z, p.y);
      if (ground && ground.normal.y >= 0.65) {
        p.y = ground.groundY;
        this.state.isGrounded = true;
      } else {
        // Walked off edge into air
        this.state.isGrounded = false;
      }
    } else {
      // ------------------------------------
      // AIRBORNE MOVEMENT (Full 3D swept movement with floor landing)
      // ------------------------------------
      let timeRemaining = dt;
      for (let bump = 0; bump < 4; bump++) {
        if (timeRemaining <= 0.0001) break;

        const delta = new THREE.Vector3(v.x * timeRemaining, v.y * timeRemaining, v.z * timeRemaining);
        if (delta.lengthSq() < 0.00001) break;

        let earliestFrac = 1.0;
        let colNormal = new THREE.Vector3(0, 1, 0);
        let hit = false;
        let landedBoxY = 0;

        // Test boxes
        for (const box of this.world.boxes) {
          const expMin = new THREE.Vector3(box.min.x - r, box.min.y - h, box.min.z - r);
          const expMax = new THREE.Vector3(box.max.x + r, box.max.y, box.max.z + r);

          const sweep = this.intersectRayAABB(p, delta, expMin, expMax);
          if (sweep && sweep.fraction < earliestFrac && sweep.fraction >= 0) {
            earliestFrac = sweep.fraction;
            colNormal.copy(sweep.normal);
            hit = true;
            landedBoxY = box.max.y;
          }
        }

        // Test ramps
        for (const ramp of this.world.ramps) {
          const sweep = this.intersectRamp(p, delta, ramp);
          if (sweep && sweep.fraction < earliestFrac && sweep.fraction >= 0) {
            earliestFrac = sweep.fraction;
            colNormal.copy(sweep.normal);
            hit = true;
            landedBoxY = p.y;
          }
        }

        const safeFrac = Math.max(0, earliestFrac - 0.001);
        p.addScaledVector(delta, safeFrac);
        timeRemaining -= timeRemaining * safeFrac;

        if (!hit) break;

        // If hit floor from above
        if (colNormal.y >= 0.65 && v.y <= 0) {
          this.state.isGrounded = true;
          this.state.groundNormal.copy(colNormal);
          p.y = landedBoxY;
          v.y = 0;
          break;
        }

        // If hit ceiling
        if (colNormal.y <= -0.65) {
          v.y = Math.min(0, v.y);
        }

        // Wall hit: slide along normal
        const dot = v.dot(colNormal);
        if (dot < 0) {
          v.addScaledVector(colNormal, -dot * 1.001);
        }
      }
    }

    if (this.world.castleBounds) {
      this.resolveCastleBounds();
    }
  }

  // Smooth circular and corridor collision resolution for the Castle Citadel geometry
  private resolveCastleBounds(): void {
    if (!this.world.castleBounds) return;
    const { centerRadius, corridorHalfWidth, ringInnerRadius, ringOuterRadius } = this.world.castleBounds;
    const p = this.state.position;
    const v = this.state.velocity;
    const r = Pmove.PLAYER_RADIUS;

    const dist = Math.hypot(p.x, p.z);
    if (dist < 0.001) return;

    // 1. Grand Outer Boundary Circle Wall (keep player inside circular citadel)
    const maxOuter = ringOuterRadius - r;
    if (dist > maxOuter) {
      const pen = dist - maxOuter;
      const nx = -p.x / dist;
      const nz = -p.z / dist;
      p.x += nx * pen;
      p.z += nz * pen;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        if (-vn > 150) this.callbacks.onWallHit?.(-vn);
        v.x -= vn * nx;
        v.z -= vn * nz;
      }
    }

    // Ground floor specific curved and corridor walls only apply below floor 2
    const floor2Height = this.world.castleBounds.floor2Height ?? 135;
    if (p.y >= floor2Height) {
      return;
    }

    const inQuarterBastion = Math.abs(p.x) > corridorHalfWidth && Math.abs(p.z) > corridorHalfWidth;

    // 2. Outer Ring Inner Circular Wall (keep player outside bastion, in the outer ring)
    if (inQuarterBastion && dist > (centerRadius + ringInnerRadius) * 0.5) {
      const minRing = ringInnerRadius + r;
      if (dist < minRing) {
        const pen = minRing - dist;
        const nx = p.x / dist;
        const nz = p.z / dist;
        p.x += nx * pen;
        p.z += nz * pen;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) {
          if (-vn > 150) this.callbacks.onWallHit?.(-vn);
          v.x -= vn * nx;
          v.z -= vn * nz;
        }
      }
    }

    // 3. Central Rotunda Circular Wall (keep player inside central rotunda)
    if (inQuarterBastion && dist < (centerRadius + ringInnerRadius) * 0.5) {
      const maxCenter = centerRadius - r;
      if (dist > maxCenter) {
        const pen = dist - maxCenter;
        const nx = -p.x / dist;
        const nz = -p.z / dist;
        p.x += nx * pen;
        p.z += nz * pen;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) {
          if (-vn > 150) this.callbacks.onWallHit?.(-vn);
          v.x -= vn * nx;
          v.z -= vn * nz;
        }
      }
    }

    // 4. North & South Straight Corridor Walls (along Z axis)
    if (dist > centerRadius - 50 && dist < ringInnerRadius + 50 && Math.abs(p.z) > corridorHalfWidth) {
      if (p.x > corridorHalfWidth - r) {
        const pen = p.x - (corridorHalfWidth - r);
        p.x -= pen;
        if (v.x > 0) {
          if (v.x > 150) this.callbacks.onWallHit?.(v.x);
          v.x = 0;
        }
      } else if (p.x < -corridorHalfWidth + r) {
        const pen = (-corridorHalfWidth + r) - p.x;
        p.x += pen;
        if (v.x < 0) {
          if (-v.x > 150) this.callbacks.onWallHit?.(-v.x);
          v.x = 0;
        }
      }
    }

    // 5. East & West Straight Corridor Walls (along X axis)
    if (dist > centerRadius - 50 && dist < ringInnerRadius + 50 && Math.abs(p.x) > corridorHalfWidth) {
      if (p.z > corridorHalfWidth - r) {
        const pen = p.z - (corridorHalfWidth - r);
        p.z -= pen;
        if (v.z > 0) {
          if (v.z > 150) this.callbacks.onWallHit?.(v.z);
          v.z = 0;
        }
      } else if (p.z < -corridorHalfWidth + r) {
        const pen = (-corridorHalfWidth + r) - p.z;
        p.z += pen;
        if (v.z < 0) {
          if (-v.z > 150) this.callbacks.onWallHit?.(-v.z);
          v.z = 0;
        }
      }
    }
  }

  // Ray-AABB intersection for swept character bounds
  private intersectRayAABB(
    origin: THREE.Vector3,
    delta: THREE.Vector3,
    min: THREE.Vector3,
    max: THREE.Vector3
  ): { fraction: number; normal: THREE.Vector3 } | null {
    let tmin = 0;
    let tmax = 1;
    let normal = new THREE.Vector3();

    const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
    for (const axis of axes) {
      const d = delta[axis];
      const p = origin[axis];
      const bmin = min[axis];
      const bmax = max[axis];

      if (Math.abs(d) < 0.000001) {
        if (p < bmin || p > bmax) return null;
      } else {
        const invD = 1.0 / d;
        let t1 = (bmin - p) * invD;
        let t2 = (bmax - p) * invD;
        const entryNormal = -Math.sign(d);

        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }

        if (t1 > tmin) {
          tmin = t1;
          normal.set(0, 0, 0);
          normal[axis] = entryNormal;
        }

        tmax = Math.min(tmax, t2);
        if (tmin > tmax || tmax <= 0.0001) return null;
      }
    }

    if (tmin >= 0 && tmin <= 1) {
      return { fraction: tmin, normal };
    }
    return null;
  }

  // Swept test against ramp plane and bounds
  private intersectRamp(
    origin: THREE.Vector3,
    delta: THREE.Vector3,
    ramp: RampCollider
  ): { fraction: number; normal: THREE.Vector3 } | null {
    const n = ramp.planeNormal;
    const denom = n.dot(delta);

    if (denom >= -0.0001) return null;

    const t = (ramp.planeConstant - n.dot(origin)) / denom;
    if (t < 0 || t > 1) return null;

    const hitPoint = origin.clone().addScaledVector(delta, t);
    const r = Pmove.PLAYER_RADIUS;

    if (
      hitPoint.x >= ramp.minX - r &&
      hitPoint.x <= ramp.maxX + r &&
      hitPoint.z >= ramp.minZ - r &&
      hitPoint.z <= ramp.maxZ + r
    ) {
      return { fraction: t, normal: ramp.planeNormal.clone() };
    }

    return null;
  }

  // Check interactive triggers (launchpads, hazard pits, checkpoints)
  private checkTriggers(): void {
    const p = this.state.position;
    const r = Pmove.PLAYER_RADIUS;

    for (const trigger of this.world.triggers) {
      if (
        p.x + r >= trigger.min.x &&
        p.x - r <= trigger.max.x &&
        p.y + Pmove.PLAYER_HEIGHT >= trigger.min.y &&
        p.y <= trigger.max.y &&
        p.z + r >= trigger.min.z &&
        p.z - r <= trigger.max.z
      ) {
        if (trigger.type === 'launchpad' && trigger.boostVelocity) {
          this.state.velocity.copy(trigger.boostVelocity);
          this.state.isGrounded = false;
          if (this.callbacks.onLaunchPad) {
            this.callbacks.onLaunchPad(trigger.boostVelocity);
          }
        } else if (trigger.type === 'hazard') {
          const respawn = trigger.respawnPoint || new THREE.Vector3(0, 30, 450);
          const yaw = trigger.respawnYaw !== undefined ? trigger.respawnYaw : 0;
          this.setPosition(respawn, yaw);
          if (this.callbacks.onHazard) {
            this.callbacks.onHazard(respawn, yaw);
          }
        }
      }
    }
  }

  // Update speed metrics & trigger speed milestone sound events
  private updateSpeedMetrics(): void {
    this.state.horizontalSpeed = Math.hypot(this.state.velocity.x, this.state.velocity.z);
    this.state.totalSpeed = this.state.velocity.length();

    for (let i = 0; i < this.milestoneThresholds.length; i++) {
      const threshold = this.milestoneThresholds[i];
      if (this.state.horizontalSpeed >= threshold) {
        if (!this.passedMilestones.has(threshold)) {
          this.passedMilestones.add(threshold);
          if (this.callbacks.onMilestone) {
            this.callbacks.onMilestone(i);
          }
        }
      } else {
        if (this.state.horizontalSpeed < threshold - 80) {
          this.passedMilestones.delete(threshold);
        }
      }
    }
  }
}
