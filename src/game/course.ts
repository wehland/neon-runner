import { laneToX } from "./collision";
import {
  FIRST_SOLID,
  SAMPLE_STEP,
  SEGMENT_LENGTH,
  SOLID_BASE,
  SOLID_VAR,
  SPAWN_AHEAD,
  SPAWN_BREAK_MARGIN,
} from "./config";

export type Vec3 = { x: number; y: number; z: number };

export type PathPose = {
  s: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  elevation: number;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
};

export type LaneMask = [boolean, boolean, boolean];

export type BreakWindow = {
  start: number;
  end: number;
  missing: number;
  survivor: number;
};

export function headingAt(s: number): number {
  return 0.32 * Math.sin(s / 80) + 0.16 * Math.sin(s / 147);
}

export function elevationAt(s: number): number {
  return 5.2 * Math.sin(s / 103) + 2.4 * Math.sin(s / 181);
}

export function laneIndex(lane: number): number {
  return Math.max(0, Math.min(2, lane + 1));
}

export function hasLane(mask: LaneMask, lane: number): boolean {
  return mask[laneIndex(lane)];
}

export function andMask(a: LaneMask, b: LaneMask): LaneMask {
  return [a[0] && b[0], a[1] && b[1], a[2] && b[2]];
}

export function alignBreakStart(s: number): number {
  return Math.ceil(s / SEGMENT_LENGTH - 1e-9) * SEGMENT_LENGTH;
}

export function allLanes(): LaneMask {
  return [true, true, true];
}

export function maskForBreak(missing: number, survivor: number): LaneMask {
  const mask = allLanes();
  mask[laneIndex(missing)] = false;
  if (missing === 0) {
    mask[laneIndex(survivor === -1 ? 1 : -1)] = false;
  }
  return mask;
}

export function breakIsSafe(missing: number, survivor: number): boolean {
  // Keep the surviving lane adjacent so every generated break remains reachable.
  if (missing === 0) return survivor === -1 || survivor === 1;
  if (missing === -1 || missing === 1) return survivor === 0;
  return false;
}

export function pickBreak(rng: () => number): { missing: number; survivor: number } {
  const roll = rng();
  if (roll < 0.15) return { missing: -1, survivor: 0 };
  if (roll < 0.3) return { missing: 1, survivor: 0 };
  return rng() < 0.5 ? { missing: 0, survivor: -1 } : { missing: 0, survivor: 1 };
}

export function lanesAt(s: number, breaks: BreakWindow[]): LaneMask {
  const mask = allLanes();
  for (const gap of breaks) {
    if (s >= gap.start && s < gap.end) {
      const dropped = maskForBreak(gap.missing, gap.survivor);
      mask[0] = mask[0] && dropped[0];
      mask[1] = mask[1] && dropped[1];
      mask[2] = mask[2] && dropped[2];
    }
  }
  return mask;
}

export function inSpawnExclusion(s: number, breaks: BreakWindow[]): boolean {
  for (const gap of breaks) {
    if (s >= gap.start - SPAWN_BREAK_MARGIN && s <= gap.end + 4) return true;
  }
  return false;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function originPose(): PathPose {
  return {
    s: 0,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    elevation: 0,
    forward: { x: 0, y: 0, z: 1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  };
}

export function stepPose(prev: PathPose, ds: number): PathPose {
  const s = prev.s + ds;
  const heading = headingAt(s);
  const elevation = elevationAt(s);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const x = prev.x + fx * ds;
  const z = prev.z + fz * ds;
  const fy = (elevation - prev.y) / ds;
  const forward = normalize({ x: fx, y: fy, z: fz });
  const right = normalize(cross({ x: 0, y: 1, z: 0 }, forward));
  const up = normalize(cross(forward, right));
  return { s, x, y: elevation, z, heading, elevation, forward, right, up };
}

export function clonePose(p: PathPose): PathPose {
  return {
    s: p.s,
    x: p.x,
    y: p.y,
    z: p.z,
    heading: p.heading,
    elevation: p.elevation,
    forward: { ...p.forward },
    right: { ...p.right },
    up: { ...p.up },
  };
}

export function lerpPose(a: PathPose, b: PathPose, t: number): PathPose {
  const u = Math.max(0, Math.min(1, t));
  const heading = a.heading + (b.heading - a.heading) * u;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const y = a.y + (b.y - a.y) * u;
  const fy = (b.y - a.y) / Math.max(1e-6, b.s - a.s);
  const forward = normalize({ x: fx, y: fy, z: fz });
  const right = normalize(cross({ x: 0, y: 1, z: 0 }, forward));
  const up = normalize(cross(forward, right));
  return {
    s: a.s + (b.s - a.s) * u,
    x: a.x + (b.x - a.x) * u,
    y,
    z: a.z + (b.z - a.z) * u,
    heading,
    elevation: y,
    forward,
    right,
    up,
  };
}

export function offsetPoint(pose: PathPose, lateral: number, vertical: number): Vec3 {
  return {
    x: pose.x + pose.right.x * lateral + pose.up.x * vertical,
    y: pose.y + pose.right.y * lateral + pose.up.y * vertical,
    z: pose.z + pose.right.z * lateral + pose.up.z * vertical,
  };
}

export function lanePoint(pose: PathPose, lane: number, vertical = 0): Vec3 {
  return offsetPoint(pose, laneToX(lane), vertical);
}

export class Course {
  readonly breaks: BreakWindow[] = [];
  private samples: PathPose[] = [originPose()];
  private nextBreakAt: number;
  private rng: () => number;

  private generateBreaks = true;
  private playerS = 0;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.nextBreakAt = FIRST_SOLID + rng() * 20;
  }

  reset(rng: () => number = this.rng): void {
    this.rng = rng;
    this.breaks.length = 0;
    this.samples = [originPose()];
    this.generateBreaks = true;
    this.playerS = 0;
    this.nextBreakAt = FIRST_SOLID + rng() * 20;
  }

  disableBreaks(): void {
    this.generateBreaks = false;
    this.breaks.length = 0;
    this.nextBreakAt = Number.POSITIVE_INFINITY;
  }

  ensure(s: number): void {
    const need = Math.max(s, this.playerS) + SPAWN_AHEAD + 40;
    while (this.nextBreakAt < need + 80) this.appendBreak();
    while (this.lastS() < need) this.appendSample();
    const keepFrom = this.playerS - 80;
    while (this.samples.length > 2 && this.samples[1].s < keepFrom) {
      this.samples.shift();
    }
    while (this.breaks.length > 0 && this.breaks[0].end < keepFrom) {
      this.breaks.shift();
    }
  }

  advance(playerS: number): void {
    this.playerS = Math.max(0, playerS);
    this.ensure(this.playerS);
  }

  poseAt(s: number): PathPose {
    this.ensure(s);
    if (s <= this.samples[0].s) return this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (s >= last.s) return last;
    let lo = 0;
    let hi = this.samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid].s <= s) lo = mid;
      else hi = mid;
    }
    const a = this.samples[lo];
    const b = this.samples[hi];
    const span = b.s - a.s || 1;
    return lerpPose(a, b, (s - a.s) / span);
  }

  lanesAtS(s: number): LaneMask {
    this.ensure(s);
    return lanesAt(s, this.breaks);
  }

  spawnBlocked(s: number): boolean {
    this.ensure(s);
    return inSpawnExclusion(s, this.breaks);
  }

  forceBreak(start: number, missing: number, survivor: number): BreakWindow {
    if (!breakIsSafe(missing, survivor)) {
      throw new Error("unsafe break");
    }
    const aligned = alignBreakStart(start);
    const gap: BreakWindow = {
      start: aligned,
      end: aligned + SEGMENT_LENGTH,
      missing,
      survivor,
    };
    this.breaks.push(gap);
    this.breaks.sort((a, b) => a.start - b.start);
    this.ensure(gap.end + 20);
    return gap;
  }

  headingRange(from: number, to: number): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (let s = from; s <= to; s += 8) {
      const h = headingAt(s);
      if (h < min) min = h;
      if (h > max) max = h;
    }
    return { min, max };
  }

  elevationRange(from: number, to: number): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (let s = from; s <= to; s += 8) {
      const y = elevationAt(s);
      if (y < min) min = y;
      if (y > max) max = y;
    }
    return { min, max };
  }

  private lastS(): number {
    return this.samples[this.samples.length - 1].s;
  }

  private appendSample(): void {
    const prev = this.samples[this.samples.length - 1];
    this.samples.push(stepPose(prev, SAMPLE_STEP));
  }

  private appendBreak(): void {
    if (!this.generateBreaks) {
      this.nextBreakAt = Number.POSITIVE_INFINITY;
      return;
    }
    const pick = pickBreak(this.rng);
    const start = alignBreakStart(this.nextBreakAt);
    const gap: BreakWindow = {
      start,
      end: start + SEGMENT_LENGTH,
      missing: pick.missing,
      survivor: pick.survivor,
    };
    this.breaks.push(gap);
    this.nextBreakAt = gap.end + SOLID_BASE + this.rng() * SOLID_VAR;
  }
}
