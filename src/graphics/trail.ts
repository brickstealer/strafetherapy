import * as THREE from 'three';

interface TrailPoint {
  position: THREE.Vector3;
  color: THREE.Color;
  time: number;
  speed: number;
}

export class TrailRenderer {
  private scene: THREE.Scene;
  private maxPoints = 500;
  private lifetime = 3.6; // Seconds before segment decays
  private points: TrailPoint[] = [];
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private uvs: Float32Array;
  private minDistance = 12.0; // Distance between recorded sample points
  private lastPosition = new THREE.Vector3();

  // Color gradient definitions matching CPMA speed brackets:
  // < 350: Faint cyan / blue
  // 350 - 600: Bright green
  // 600 - 900: Fiery yellow / orange
  // > 900: Blazing magenta / white with neon glow
  private colorLow = new THREE.Color(0x00d4ff);     // Faint Cyan
  private colorMid = new THREE.Color(0x00ff66);     // Bright Green
  private colorHigh = new THREE.Color(0xffaa00);    // Fiery Yellow / Orange
  private colorSuper = new THREE.Color(0xff007f);   // Blazing Magenta
  private colorHyper = new THREE.Color(0xffffff);   // Hyper White

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const maxVertices = this.maxPoints * 2;
    this.positions = new Float32Array(maxVertices * 3);
    this.colors = new Float32Array(maxVertices * 4); // RGBA
    this.uvs = new Float32Array(maxVertices * 2);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));

    // Dynamic index buffer for triangle strip
    const maxIndices = (this.maxPoints - 1) * 6;
    const indices = new Uint16Array(maxIndices);
    let idx = 0;
    for (let i = 0; i < this.maxPoints - 1; i++) {
      const v0 = i * 2;
      const v1 = i * 2 + 1;
      const v2 = (i + 1) * 2;
      const v3 = (i + 1) * 2 + 1;

      indices[idx++] = v0;
      indices[idx++] = v1;
      indices[idx++] = v2;

      indices[idx++] = v2;
      indices[idx++] = v1;
      indices[idx++] = v3;
    }
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);

    // High performance glowing ribbon shader with vertex colors and alpha fading
    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec4 color;
        varying vec4 vColor;
        varying vec2 vUv;
        void main() {
          vColor = color;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec4 vColor;
        varying vec2 vUv;
        void main() {
          // Neon tube edge glow: center is bright, edges fade softly
          float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
          float glow = pow(edge, 1.4);
          gl_FragColor = vec4(vColor.rgb * (1.2 + edge * 0.4), vColor.a * glow);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  // Get color based on horizontal speed
  public getSpeedColor(speed: number): THREE.Color {
    const c = new THREE.Color();
    if (speed < 350) {
      const t = Math.max(0, speed / 350);
      c.copy(this.colorLow).multiplyScalar(0.7 + t * 0.3);
    } else if (speed < 600) {
      const t = (speed - 350) / (600 - 350);
      c.lerpColors(this.colorLow, this.colorMid, t);
    } else if (speed < 900) {
      const t = (speed - 600) / (900 - 600);
      c.lerpColors(this.colorMid, this.colorHigh, t);
    } else if (speed < 1200) {
      const t = (speed - 900) / (1200 - 900);
      c.lerpColors(this.colorHigh, this.colorSuper, t);
    } else {
      const t = Math.min(1, (speed - 1200) / 400);
      c.lerpColors(this.colorSuper, this.colorHyper, t);
    }
    return c;
  }

  public update(playerPosition: THREE.Vector3, speed: number, currentTime: number, cameraPosition: THREE.Vector3): void {
    // Offset ribbon slightly below eye height (around torso level: y - 24)
    const trailPos = playerPosition.clone().add(new THREE.Vector3(0, 24, 0));

    // Check if we should add a new point
    const dist = trailPos.distanceTo(this.lastPosition);
    if (dist >= this.minDistance || this.points.length === 0) {
      const pointColor = this.getSpeedColor(speed);
      this.points.unshift({
        position: trailPos.clone(),
        color: pointColor,
        time: currentTime,
        speed
      });
      this.lastPosition.copy(trailPos);

      // Clamp max points
      if (this.points.length > this.maxPoints) {
        this.points.pop();
      }
    } else if (this.points.length > 0) {
      // Continuously update the head point position
      this.points[0].position.copy(trailPos);
      this.points[0].color = this.getSpeedColor(speed);
      this.points[0].speed = speed;
      this.points[0].time = currentTime;
    }

    // Prune expired points
    while (this.points.length > 1 && currentTime - this.points[this.points.length - 1].time > this.lifetime) {
      this.points.pop();
    }

    if (this.points.length < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    // Build ribbon geometry with camera-facing quad strip
    const baseWidth = 14.0;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;
    const uvAttr = this.geometry.attributes.uv as THREE.BufferAttribute;

    const count = this.points.length;
    const forward = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const pt = this.points[i];
      const age = currentTime - pt.time;
      const lifeRatio = Math.max(0, 1.0 - age / this.lifetime);

      // Dynamic alpha based on age & speed (higher speed glows brighter)
      const speedGlow = Math.min(1.0, Math.max(0.3, pt.speed / 700));
      const alpha = Math.pow(lifeRatio, 1.2) * (0.6 + speedGlow * 0.4);

      // Segment orientation
      if (i < count - 1) {
        forward.subVectors(this.points[i + 1].position, pt.position).normalize();
      } else {
        forward.subVectors(pt.position, this.points[i - 1].position).normalize();
      }

      toCam.subVectors(cameraPosition, pt.position).normalize();
      side.crossVectors(forward, toCam).normalize();

      // Ribbon width tapers gently at tail
      const width = baseWidth * (0.4 + lifeRatio * 0.6);

      // Left vertex
      const leftX = pt.position.x - side.x * (width * 0.5);
      const leftY = pt.position.y - side.y * (width * 0.5);
      const leftZ = pt.position.z - side.z * (width * 0.5);

      // Right vertex
      const rightX = pt.position.x + side.x * (width * 0.5);
      const rightY = pt.position.y + side.y * (width * 0.5);
      const rightZ = pt.position.z + side.z * (width * 0.5);

      const vLeft = i * 2;
      const vRight = i * 2 + 1;

      posAttr.setXYZ(vLeft, leftX, leftY, leftZ);
      posAttr.setXYZ(vRight, rightX, rightY, rightZ);

      colAttr.setXYZW(vLeft, pt.color.r, pt.color.g, pt.color.b, alpha);
      colAttr.setXYZW(vRight, pt.color.r, pt.color.g, pt.color.b, alpha);

      uvAttr.setXY(vLeft, 0, 0);
      uvAttr.setXY(vRight, 0, 1);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;

    // Draw indices for count - 1 quads
    this.geometry.setDrawRange(0, (count - 1) * 6);
  }

  public clear(): void {
    this.points = [];
    this.geometry.setDrawRange(0, 0);
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
  }
}
