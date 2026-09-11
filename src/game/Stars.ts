import * as THREE from "three";
import { STAR_FAR_COUNT, STAR_NEAR_COUNT } from "./config";

function createStarLayer(
  count: number,
  span: number,
  color: number,
  size: number,
): { points: THREE.Points; positions: Float32Array } {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * span;
    positions[i * 3 + 1] = (Math.random() - 0.5) * span;
    positions[i * 3 + 2] = (Math.random() - 0.5) * span;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, positions };
}

function wrapAround(value: number, center: number, span: number): number {
  const half = span * 0.5;
  let d = value - center;
  d = ((d + half) % span + span) % span - half;
  return center + d;
}

export class Starfield {
  readonly group = new THREE.Group();
  private readonly far: Float32Array;
  private readonly near: Float32Array;
  private readonly farAttr: THREE.BufferAttribute;
  private readonly nearAttr: THREE.BufferAttribute;
  private readonly farSpan = 400;
  private readonly nearSpan = 360;

  constructor() {
    const far = createStarLayer(STAR_FAR_COUNT, this.farSpan, 0xb8c8e8, 0.12);
    const near = createStarLayer(STAR_NEAR_COUNT, this.nearSpan, 0xe8f6ff, 0.38);
    this.far = far.positions;
    this.near = near.positions;
    this.farAttr = far.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.nearAttr = near.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.group.add(far.points, near.points);
    this.group.frustumCulled = false;
  }

  sync(
    center: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    speed: number,
    dt: number,
  ): void {
    // Wrap around the camera so the field stays with the follow cam, not world origin.
    this.wrap(this.far, this.farAttr, center, forward, this.farSpan, speed * 0.18 * dt);
    this.wrap(this.near, this.nearAttr, center, forward, this.nearSpan, speed * 0.45 * dt);
  }

  private wrap(
    data: Float32Array,
    attr: THREE.BufferAttribute,
    center: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    span: number,
    parallax: number,
  ): void {
    for (let i = 0; i < data.length; i += 3) {
      data[i] -= forward.x * parallax;
      data[i + 1] -= forward.y * parallax;
      data[i + 2] -= forward.z * parallax;
      data[i] = wrapAround(data[i], center.x, span);
      data[i + 1] = wrapAround(data[i + 1], center.y, span);
      data[i + 2] = wrapAround(data[i + 2], center.z, span);
    }
    attr.needsUpdate = true;
  }
}
