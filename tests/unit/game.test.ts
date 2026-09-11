import { describe, expect, it } from "vitest";
import {
  clampLane,
  obstacleCollides,
  orbCollides,
  startJump,
  stepJump,
  stepLaneX,
} from "../../src/game/collision";
import { HIT_Z, LANE_WIDTH, ORB_RADIUS, BASE_SPEED, SEGMENT_COUNT, SEGMENT_LENGTH } from "../../src/game/config";
import { breakIsSafe, Course, hasLane, pickBreak } from "../../src/game/course";
import { currentSpeed, fillSegment, GameSimulation, mulberry32, recycleSegments } from "../../src/game/simulation";

function clearTraffic(sim: GameSimulation): void {
  for (const obstacle of sim.obstacles) obstacle.active = false;
  for (const orb of sim.orbs) orb.active = false;
  sim.spawnZ = 1e9;
}

describe("lane movement", () => {
  it("clamps to three lanes", () => {
    expect(clampLane(-4)).toBe(-1);
    expect(clampLane(4)).toBe(1);
    expect(clampLane(0.4)).toBe(0);
  });

  it("interpolates toward the lane instead of teleporting", () => {
    const next = stepLaneX(0, 1, 0.016);
    expect(next).toBeLessThan(0);
    expect(next).toBeGreaterThan(-LANE_WIDTH);
  });
});

describe("jump", () => {
  it("starts a jump from the ground and rejects double-jump", () => {
    const grounded = { y: 0, vy: 0, grounded: true };
    const airborne = startJump(grounded);
    expect(airborne.grounded).toBe(false);
    expect(airborne.vy).toBeGreaterThan(0);
    const again = startJump(airborne);
    expect(again.vy).toBe(airborne.vy);
  });

  it("returns to the ground", () => {
    let state = startJump({ y: 0, vy: 0, grounded: true });
    let landed = false;
    for (let i = 0; i < 120; i++) {
      state = stepJump(state, 0.016);
      if (state.grounded && state.y === 0) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
  });
});

describe("speed", () => {
  it("ramps linearly with time and has no cap", () => {
    expect(currentSpeed(0)).toBe(BASE_SPEED);
    expect(currentSpeed(30)).toBeCloseTo(BASE_SPEED * 1.15, 8);
    expect(currentSpeed(60)).toBeCloseTo(BASE_SPEED * 1.3, 8);
    expect(currentSpeed(90)).toBeCloseTo(BASE_SPEED * 1.45, 8);
    expect(currentSpeed(10_000)).toBeGreaterThan(currentSpeed(90));
  });
});

describe("collision", () => {
  it("hits an obstacle in the same lane on the ground", () => {
    expect(
      obstacleCollides(
        { lane: 0, z: 10, y: 0 },
        { lane: 0, z: 10, height: 2.5, active: true },
        HIT_Z,
      ),
    ).toBe(true);
  });

  it("clears a short obstacle while jumping", () => {
    expect(
      obstacleCollides(
        { lane: 0, z: 10, y: 1.4 },
        { lane: 0, z: 10, height: 0.95, active: true },
        HIT_Z,
      ),
    ).toBe(false);
  });

  it("collects an orb in the same lane", () => {
    expect(orbCollides({ lane: 1, z: 5 }, { lane: 1, z: 5.2, active: true }, ORB_RADIUS)).toBe(true);
    expect(orbCollides({ lane: 0, z: 5 }, { lane: 1, z: 5.2, active: true }, ORB_RADIUS)).toBe(false);
  });
});

describe("course", () => {
  it("never generates empty or two-lane jump breaks", () => {
    const course = new Course(mulberry32(42));
    for (let s = 0; s <= 2500; s += 3) {
      const mask = course.lanesAtS(s);
      const live = mask.filter(Boolean).length;
      expect(live).toBeGreaterThanOrEqual(1);
      expect(live).toBeLessThanOrEqual(3);
      if (live === 2) expect(mask[1]).toBe(true);
      if (live === 1) {
        expect(mask[1]).toBe(false);
        expect(mask[0] !== mask[2]).toBe(true);
      }
    }
  });

  it("winds heading and elevation over a long generate", () => {
    const course = new Course(mulberry32(5));
    const heading = course.headingRange(0, 900);
    const elevation = course.elevationRange(0, 900);
    expect(heading.max - heading.min).toBeGreaterThan(0.25);
    expect(elevation.max - elevation.min).toBeGreaterThan(3);
  });

  it("pickBreak always has an adjacent survivor", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 80; i++) {
      const pick = pickBreak(rng);
      expect(breakIsSafe(pick.missing, pick.survivor)).toBe(true);
    }
  });

  it("places gaps on whole track segments so a live rail is not a kill zone", () => {
    const course = new Course(mulberry32(8));
    course.ensure(2000);
    expect(course.breaks.length).toBeGreaterThan(0);
    for (const gap of course.breaks) {
      expect(gap.start % SEGMENT_LENGTH).toBe(0);
      expect(gap.end - gap.start).toBe(SEGMENT_LENGTH);
    }
  });
});

describe("GameSimulation", () => {
  it("starts on center lane B and cannot move outside three lanes", () => {
    const sim = new GameSimulation(mulberry32(1));
    sim.start();
    expect(sim.lane).toBe(0);
    sim.moveLeft();
    sim.moveLeft();
    sim.moveLeft();
    expect(sim.lane).toBe(-1);
    sim.moveRight();
    sim.moveRight();
    sim.moveRight();
    sim.moveRight();
    expect(sim.lane).toBe(1);
  });

  it("allows airborne steering", () => {
    const sim = new GameSimulation(mulberry32(2));
    sim.start();
    sim.jump();
    expect(sim.grounded).toBe(false);
    sim.moveLeft();
    expect(sim.lane).toBe(-1);
  });

  it("spawns obstacles and collectibles ahead on live rails", () => {
    const sim = new GameSimulation(mulberry32(7));
    sim.start();
    let sawObstacle = false;
    let sawOrb = false;
    for (let i = 0; i < 200 && sim.mode === "running"; i++) {
      sim.tick(0.05);
      if (sim.obstacles.some((item) => item.active)) sawObstacle = true;
      if (sim.orbs.some((item) => item.active)) sawOrb = true;
    }
    expect(sawObstacle).toBe(true);
    expect(sawOrb).toBe(true);
    for (const obstacle of sim.obstacles) {
      if (!obstacle.active) continue;
      expect(hasLane(sim.course.lanesAtS(obstacle.z), obstacle.lane)).toBe(true);
    }
  });

  it("recycles track segments without growing the pool", () => {
    const sim = new GameSimulation(mulberry32(3));
    sim.start();
    clearTraffic(sim);
    sim.course.disableBreaks();
    for (const segment of sim.segments) fillSegment(segment, segment.s, sim.course);
    const ss = new Set(sim.segments.map((s) => s.s));
    for (let i = 0; i < 400; i++) sim.tick(0.05);
    expect(sim.mode).toBe("running");
    expect(sim.segments.length).toBe(SEGMENT_COUNT);
    const moved = sim.segments.some((s) => s.s > SEGMENT_COUNT * SEGMENT_LENGTH);
    expect(moved).toBe(true);
    expect(new Set(sim.segments.map((s) => s.s)).size).toBe(SEGMENT_COUNT);
    expect(ss.size).toBe(SEGMENT_COUNT);
  });

  it("recycleSegments keeps a fixed count", () => {
    const sim = new GameSimulation(mulberry32(4));
    recycleSegments(sim.segments, 80, sim.course);
    expect(sim.segments.length).toBe(SEGMENT_COUNT);
  });

  it("collecting an orb increases energy", () => {
    const sim = new GameSimulation(mulberry32(9));
    sim.start();
    sim.spawnOrbAt(0, 2);
    expect(sim.collectNearestOrb()).toBe(true);
    expect(sim.energy).toBe(1);
    expect(sim.orbs.some((orb) => orb.active)).toBe(false);
  });

  it("obstacle collision causes game over", () => {
    const sim = new GameSimulation(mulberry32(11));
    sim.start();
    sim.spawnObstacleAt(0, 0.4, "tall");
    sim.tick(0.016);
    expect(sim.mode).toBe("gameover");
  });

  it("reset restores a fresh run without growing pools", () => {
    const sim = new GameSimulation(mulberry32(13));
    sim.start();
    for (let i = 0; i < 80; i++) sim.tick(0.05);
    sim.crash();
    sim.reset();
    expect(sim.mode).toBe("running");
    expect(sim.distance).toBe(0);
    expect(sim.energy).toBe(0);
    expect(sim.lane).toBe(0);
    expect(sim.z).toBe(0);
    expect(sim.obstacles.length).toBe(20);
    expect(sim.orbs.length).toBe(20);
    expect(sim.segments.length).toBe(SEGMENT_COUNT);
    expect(sim.obstacles.every((item) => !item.active)).toBe(true);
  });

  it("does not tick while in start or gameover", () => {
    const sim = new GameSimulation();
    sim.tick(1);
    expect(sim.z).toBe(0);
    sim.start();
    sim.crash();
    const z = sim.z;
    sim.tick(1);
    expect(sim.z).toBe(z);
  });

  it("emits jump audio only for a valid grounded jump", () => {
    const sim = new GameSimulation();
    sim.start();
    sim.jump();
    expect(sim.drainEvents().jumped).toBe(true);
    sim.jump();
    expect(sim.drainEvents().jumped).toBe(false);
  });

  it("emits collect audio when an orb is collected", () => {
    const sim = new GameSimulation(mulberry32(9));
    sim.start();
    sim.spawnOrbAt(0, 2);
    sim.collectNearestOrb();
    expect(sim.drainEvents().collected).toBe(1);
  });

  it("emits crash audio once when entering game over", () => {
    const sim = new GameSimulation();
    sim.start();
    sim.crash();
    expect(sim.drainEvents().crashed).toBe(true);
    sim.crash();
    expect(sim.drainEvents().crashed).toBe(false);
  });

  it("jumps a scripted B-gap onto the surviving rail", () => {
    const sim = new GameSimulation(mulberry32(21));
    sim.start();
    clearTraffic(sim);
    const gap = sim.forceBreak(28, 0, 1);
    while (sim.z < gap.start - 8 && sim.mode === "running") sim.tick(0.016);
    sim.jump();
    sim.moveRight();
    while (sim.z < gap.end + 6 && sim.mode === "running") sim.tick(0.016);
    expect(sim.mode).toBe("running");
    expect(sim.lane).toBe(1);
  });

  it("falls when staying on an ending B rail without jumping", () => {
    const sim = new GameSimulation(mulberry32(22));
    sim.start();
    clearTraffic(sim);
    const gap = sim.forceBreak(28, 0, -1);
    expect(hasLane(sim.course.lanesAtS(gap.start + 1), 0)).toBe(false);
    while (sim.z < gap.end && sim.mode === "running") sim.tick(0.016);
    expect(sim.mode).toBe("gameover");
    expect(sim.z).toBeGreaterThanOrEqual(gap.start);
  });

  it("does not show the current rail after that rail has ended", () => {
    const sim = new GameSimulation(mulberry32(22));
    sim.start();
    clearTraffic(sim);
    const gap = sim.forceBreak(28, 0, -1);
    const covering = sim.segments.find((segment) => segment.s === gap.start);
    expect(covering).toBeTruthy();
    expect(covering?.lanes[1]).toBe(false);
    const before = sim.segments.find((segment) => segment.s === gap.start - SEGMENT_LENGTH);
    expect(before?.lanes[1]).toBe(true);
    expect(before?.nextLanes[1]).toBe(false);
  });
});
