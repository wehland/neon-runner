import {
  BASE_SPEED,
  BEHIND_PADDING,
  GAP_LENGTH,
  GAP_SPEED_FACTOR,
  HIT_Z,
  LOW_HEIGHT,
  MAX_DT,
  MIN_GAP,
  OBSTACLE_POOL,
  ORB_POOL,
  ORB_RADIUS,
  SEGMENT_COUNT,
  SEGMENT_LENGTH,
  SPAWN_AHEAD,
  SPEED_RAMP_INTERVAL,
  SPEED_RAMP_RATE,
  TALL_HEIGHT,
} from "./config";
import { clampLane, obstacleCollides, orbCollides, startJump, stepJump, stepLaneX } from "./collision";
import { andMask, Course, clonePose, hasLane, offsetPoint, type BreakWindow, type LaneMask, type PathPose } from "./course";

export type GameMode = "start" | "running" | "gameover";
export type ObstacleKind = "low" | "tall";

export type ObstacleState = {
  active: boolean;
  lane: number;
  z: number;
  height: number;
  kind: ObstacleKind;
};

export type OrbState = {
  active: boolean;
  lane: number;
  z: number;
  phase: number;
};

export type SegmentState = {
  s: number;
  pose: PathPose;
  lanes: LaneMask;
  nextLanes: LaneMask;
};

export type AudioEvents = {
  jumped: boolean;
  collected: number;
  crashed: boolean;
};

export type GameSnapshot = {
  mode: GameMode;
  lane: number;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  z: number;
  distance: number;
  energy: number;
  speed: number;
  heading: number;
  elevation: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  rails: LaneMask;
  breakAhead: boolean;
  obstacleCount: number;
  orbCount: number;
  segmentCount: number;
};

export function currentSpeed(elapsedTimeSeconds: number): number {
  return BASE_SPEED * (1 + SPEED_RAMP_RATE * Math.max(0, elapsedTimeSeconds) / SPEED_RAMP_INTERVAL);
}

export function fillSegment(segment: SegmentState, s: number, course: Course): void {
  course.ensure(s + SEGMENT_LENGTH + 4);
  segment.s = s;
  segment.pose = clonePose(course.poseAt(s + SEGMENT_LENGTH * 0.5));
  segment.lanes = andMask(
    course.lanesAtS(s),
    andMask(course.lanesAtS(s + SEGMENT_LENGTH * 0.5), course.lanesAtS(s + SEGMENT_LENGTH - 0.001)),
  );
  segment.nextLanes = course.lanesAtS(s + SEGMENT_LENGTH);
}

export function recycleSegments(segments: SegmentState[], playerS: number, course: Course): void {
  let maxS = -Infinity;
  for (const segment of segments) {
    if (segment.s > maxS) maxS = segment.s;
  }
  for (const segment of segments) {
    if (segment.s + SEGMENT_LENGTH < playerS - BEHIND_PADDING) {
      maxS += SEGMENT_LENGTH;
      fillSegment(segment, maxS, course);
    }
  }
}

export class GameSimulation {
  mode: GameMode = "start";
  lane = 0;
  x = 0;
  y = 0;
  vy = 0;
  grounded = true;
  z = 0;
  distance = 0;
  energy = 0;
  speed = BASE_SPEED;
  time = 0;
  spawnZ = SPAWN_AHEAD;
  heading = 0;
  elevation = 0;
  worldX = 0;
  worldY = 0;
  worldZ = 0;
  breakAhead = false;
  rails: LaneMask = [true, true, true];
  pose: PathPose;
  readonly course: Course;
  readonly segments: SegmentState[];
  readonly obstacles: ObstacleState[];
  readonly orbs: OrbState[];
  private rng: () => number;
  private pending: AudioEvents = { jumped: false, collected: 0, crashed: false };

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    this.course = new Course(rng);
    this.pose = this.course.poseAt(0);
    this.segments = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
      const segment: SegmentState = {
        s: 0,
        pose: this.pose,
        lanes: [true, true, true],
        nextLanes: [true, true, true],
      };
      fillSegment(segment, i * SEGMENT_LENGTH, this.course);
      return segment;
    });
    this.obstacles = Array.from({ length: OBSTACLE_POOL }, () => ({
      active: false,
      lane: 0,
      z: 0,
      height: TALL_HEIGHT,
      kind: "tall",
    }));
    this.orbs = Array.from({ length: ORB_POOL }, () => ({
      active: false,
      lane: 0,
      z: 0,
      phase: 0,
    }));
    this.refreshWorld();
  }

  start(): void {
    this.resetInternal();
    this.mode = "running";
  }

  reset(): void {
    this.resetInternal();
    this.mode = "running";
  }

  moveLeft(): void {
    if (this.mode !== "running") return;
    this.lane = clampLane(this.lane - 1);
  }

  moveRight(): void {
    if (this.mode !== "running") return;
    this.lane = clampLane(this.lane + 1);
  }

  setLane(lane: number): void {
    this.lane = clampLane(lane);
  }

  jump(): void {
    if (this.mode !== "running") return;
    if (!this.grounded) return;
    const next = startJump({ y: this.y, vy: this.vy, grounded: this.grounded });
    this.y = next.y;
    this.vy = next.vy;
    this.grounded = next.grounded;
    this.pending.jumped = true;
  }

  crash(): void {
    if (this.mode === "gameover") return;
    this.mode = "gameover";
    this.pending.crashed = true;
  }

  forceBreak(start: number, missing: number, survivor: number): BreakWindow {
    const gap = this.course.forceBreak(start, missing, survivor);
    this.refreshSegments();
    return gap;
  }

  tick(dt: number): void {
    if (this.mode !== "running") return;
    const step = Math.min(MAX_DT, Math.max(0, dt));
    if (step === 0) return;

    this.time += step;
    this.speed = currentSpeed(this.time);
    this.z += this.speed * step;
    this.distance = this.z;
    this.x = stepLaneX(this.x, this.lane, step);

    const jump = stepJump({ y: this.y, vy: this.vy, grounded: this.grounded }, step);
    this.y = jump.y;
    this.vy = jump.vy;
    this.grounded = jump.grounded;

    this.course.advance(this.z);
    const onRail = hasLane(this.course.lanesAtS(this.z), this.lane);
    if (!onRail && (this.grounded || this.y <= 0)) {
      this.refreshWorld();
      this.crash();
      return;
    }

    recycleSegments(this.segments, this.z, this.course);
    this.deactivateBehind();
    this.spawnAhead();
    this.animateOrbs(step);
    this.refreshWorld();
    this.resolveCollisions();
  }

  spawnObstacleAt(lane: number, z: number, kind: ObstacleKind): ObstacleState | null {
    const slot = this.obstacles.find((item) => !item.active);
    if (!slot) return null;
    slot.active = true;
    slot.lane = clampLane(lane);
    slot.z = z;
    slot.kind = kind;
    slot.height = kind === "low" ? LOW_HEIGHT : TALL_HEIGHT;
    return slot;
  }

  spawnOrbAt(lane: number, z: number): OrbState | null {
    const slot = this.orbs.find((item) => !item.active);
    if (!slot) return null;
    slot.active = true;
    slot.lane = clampLane(lane);
    slot.z = z;
    slot.phase = this.rng() * Math.PI * 2;
    return slot;
  }

  collectNearestOrb(): boolean {
    let nearest: OrbState | null = null;
    let best = Infinity;
    for (const orb of this.orbs) {
      if (!orb.active) continue;
      const d = Math.abs(orb.z - this.z);
      if (d < best) {
        best = d;
        nearest = orb;
      }
    }
    if (!nearest) return false;
    nearest.active = false;
    this.energy += 1;
    this.pending.collected += 1;
    return true;
  }

  drainEvents(): AudioEvents {
    const events = this.pending;
    this.pending = { jumped: false, collected: 0, crashed: false };
    return events;
  }

  snapshot(): GameSnapshot {
    return {
      mode: this.mode,
      lane: this.lane,
      x: this.x,
      y: this.y,
      vy: this.vy,
      grounded: this.grounded,
      z: this.z,
      distance: this.distance,
      energy: this.energy,
      speed: this.speed,
      heading: this.heading,
      elevation: this.elevation,
      worldX: this.worldX,
      worldY: this.worldY,
      worldZ: this.worldZ,
      rails: [...this.rails] as LaneMask,
      breakAhead: this.breakAhead,
      obstacleCount: this.obstacles.filter((item) => item.active).length,
      orbCount: this.orbs.filter((item) => item.active).length,
      segmentCount: this.segments.length,
    };
  }

  poolCounts(): {
    obstaclesActive: number;
    orbsActive: number;
    obstaclesCapacity: number;
    orbsCapacity: number;
    segments: number;
  } {
    return {
      obstaclesActive: this.obstacles.filter((item) => item.active).length,
      orbsActive: this.orbs.filter((item) => item.active).length,
      obstaclesCapacity: this.obstacles.length,
      orbsCapacity: this.orbs.length,
      segments: this.segments.length,
    };
  }

  private resetInternal(): void {
    this.lane = 0;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.z = 0;
    this.distance = 0;
    this.energy = 0;
    this.speed = BASE_SPEED;
    this.time = 0;
    this.spawnZ = SPAWN_AHEAD;
    this.course.reset(this.rng);
    for (let i = 0; i < this.segments.length; i++) {
      fillSegment(this.segments[i], i * SEGMENT_LENGTH, this.course);
    }
    for (const obstacle of this.obstacles) obstacle.active = false;
    for (const orb of this.orbs) orb.active = false;
    this.pending = { jumped: false, collected: 0, crashed: false };
    this.refreshWorld();
  }

  private refreshSegments(): void {
    for (const segment of this.segments) {
      fillSegment(segment, segment.s, this.course);
    }
  }

  private refreshWorld(): void {
    this.pose = this.course.poseAt(this.z);
    const world = offsetPoint(this.pose, this.x, this.y);
    this.worldX = world.x;
    this.worldY = world.y;
    this.worldZ = world.z;
    this.heading = this.pose.heading;
    this.elevation = this.pose.elevation;
    this.rails = this.course.lanesAtS(this.z);
    this.breakAhead = !hasLane(this.course.lanesAtS(this.z + GAP_LENGTH * 0.7), this.lane);
  }

  private deactivateBehind(): void {
    const behind = this.z - 8;
    for (const obstacle of this.obstacles) {
      if (obstacle.active && obstacle.z < behind) obstacle.active = false;
    }
    for (const orb of this.orbs) {
      if (orb.active && orb.z < behind) orb.active = false;
    }
  }

  private spawnAhead(): void {
    while (this.spawnZ < this.z + SPAWN_AHEAD) {
      this.placeSpawn(this.spawnZ);
      const extra = MIN_GAP * (0.25 + this.rng() * 0.7);
      this.spawnZ += MIN_GAP + extra + this.speed * GAP_SPEED_FACTOR;
    }
  }

  private placeSpawn(z: number): void {
    if (this.course.spawnBlocked(z)) return;
    const mask = this.course.lanesAtS(z);
    const live: number[] = [];
    for (let lane = -1; lane <= 1; lane++) {
      if (hasLane(mask, lane)) live.push(lane);
    }
    if (live.length === 0) return;
    const roll = this.rng();
    const lane = live[Math.floor(this.rng() * live.length)];
    if (roll < 0.62) {
      const kind: ObstacleKind = this.rng() < 0.45 ? "low" : "tall";
      this.spawnObstacleAt(lane, z, kind);
      if (this.rng() < 0.35) {
        const others = live.filter((item) => item !== lane);
        if (others.length > 0) {
          this.spawnOrbAt(others[Math.floor(this.rng() * others.length)], z + 4);
        }
      }
    } else {
      this.spawnOrbAt(lane, z);
    }
  }

  private animateOrbs(dt: number): void {
    for (const orb of this.orbs) {
      if (orb.active) orb.phase += dt * 2.4;
    }
  }

  private resolveCollisions(): void {
    const player = { lane: this.lane, z: this.z, y: this.y };
    for (const orb of this.orbs) {
      if (orbCollides(player, orb, ORB_RADIUS)) {
        orb.active = false;
        this.energy += 1;
        this.pending.collected += 1;
      }
    }
    for (const obstacle of this.obstacles) {
      if (obstacleCollides(player, obstacle, HIT_Z)) {
        this.crash();
        return;
      }
    }
  }
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
