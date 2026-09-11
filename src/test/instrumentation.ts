// Attached only when Vite is built with VITE_E2E=true (see playwright.config.ts / build:e2e).
import type { Game } from "../game/Game";
import { clampLane, laneToX } from "../game/collision";
import type { PathPose } from "../game/course";
import type { LaneMask } from "../game/course";

export type NeonRunnerTestApi = {
  getState: () => ReturnType<Game["sim"]["snapshot"]>;
  tick: (dt: number) => void;
  setLane: (lane: number) => void;
  jump: () => void;
  forceSpawn: (kind: "obstacle" | "orb", lane?: number, obstacleKind?: "low" | "tall") => void;
  forceCollect: () => boolean;
  forceCrash: () => void;
  forceBreak: (missing: number, survivor: number, distanceAhead?: number) => { start: number; end: number };
  getCourseAt: (s: number) => PathPose;
  lanesAt: (s: number) => LaneMask;
  airborneMove: (dir: "left" | "right") => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;
  getPoolCounts: () => ReturnType<Game["sim"]["poolCounts"]> & ReturnType<Game["objectCounts"]>;
};

declare global {
  interface Window {
    __NEON_RUNNER__?: NeonRunnerTestApi;
  }
}

export function attachInstrumentation(game: Game): void {
  if (import.meta.env.VITE_E2E !== "true") return;

  window.__NEON_RUNNER__ = {
    getState: () => game.sim.snapshot(),
    tick: (dt: number) => {
      game.sim.tick(dt);
      game.step(0);
    },
    setLane: (lane: number) => {
      game.sim.setLane(clampLane(lane));
      game.sim.x = laneToX(clampLane(lane));
      game.step(0);
    },
    jump: () => {
      game.sim.jump();
      game.step(0);
    },
    forceSpawn: (kind, lane = 0, obstacleKind = "tall") => {
      const z = game.sim.z + 12;
      if (kind === "obstacle") game.sim.spawnObstacleAt(lane, z, obstacleKind);
      else game.sim.spawnOrbAt(lane, z);
      game.step(0);
    },
    forceCollect: () => {
      const ok = game.sim.collectNearestOrb();
      game.step(0);
      return ok;
    },
    forceCrash: () => {
      game.sim.crash();
      game.step(0);
    },
    forceBreak: (missing, survivor, distanceAhead = 24) => {
      const gap = game.sim.forceBreak(game.sim.z + distanceAhead, missing, survivor);
      game.step(0);
      return { start: gap.start, end: gap.end };
    },
    getCourseAt: (s) => game.sim.course.poseAt(s),
    lanesAt: (s) => game.sim.course.lanesAtS(s),
    airborneMove: (dir) => {
      if (dir === "left") game.sim.moveLeft();
      else game.sim.moveRight();
      game.step(0);
    },
    reset: () => {
      game.sim.reset();
      game.step(0);
    },
    pause: () => {
      game.paused = true;
    },
    resume: () => {
      game.paused = false;
    },
    getPoolCounts: () => ({
      ...game.sim.poolCounts(),
      ...game.objectCounts(),
    }),
  };
}
