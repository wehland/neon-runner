import {
  GRAVITY,
  JUMP_CLEAR_EPSILON,
  JUMP_VELOCITY,
  LANE_LERP,
  LANE_MAX,
  LANE_MIN,
  LANE_WIDTH,
} from "./config";

export type JumpState = {
  y: number;
  vy: number;
  grounded: boolean;
};

export function clampLane(lane: number): number {
  return Math.max(LANE_MIN, Math.min(LANE_MAX, Math.round(lane)));
}

export function laneToX(lane: number, laneWidth = LANE_WIDTH): number {
  // Chase cam looks down +Z, so world +X is screen-left. Negate so lane -1 stays visual left.
  return -lane * laneWidth;
}

export function lerpExp(current: number, target: number, k: number, dt: number): number {
  if (dt <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-k * dt));
}

export function stepLaneX(currentX: number, lane: number, dt: number): number {
  return lerpExp(currentX, laneToX(clampLane(lane)), LANE_LERP, dt);
}

export function startJump(state: JumpState, jumpV = JUMP_VELOCITY): JumpState {
  if (!state.grounded) {
    return { y: state.y, vy: state.vy, grounded: state.grounded };
  }
  return { y: state.y, vy: jumpV, grounded: false };
}

export function stepJump(state: JumpState, dt: number, gravity = GRAVITY): JumpState {
  if (state.grounded && state.y <= 0 && state.vy === 0) {
    return { y: 0, vy: 0, grounded: true };
  }
  const vy = state.vy - gravity * dt;
  let y = state.y + vy * dt;
  if (y <= 0) {
    return { y: 0, vy: 0, grounded: true };
  }
  return { y, vy, grounded: false };
}

export function obstacleCollides(
  player: { lane: number; z: number; y: number },
  obstacle: { lane: number; z: number; height: number; active: boolean },
  hitZ: number,
): boolean {
  if (!obstacle.active || player.lane !== obstacle.lane) return false;
  if (Math.abs(player.z - obstacle.z) > hitZ) return false;
  return player.y < obstacle.height - JUMP_CLEAR_EPSILON;
}

export function orbCollides(
  player: { lane: number; z: number },
  orb: { lane: number; z: number; active: boolean },
  radius: number,
): boolean {
  if (!orb.active || player.lane !== orb.lane) return false;
  return Math.abs(player.z - orb.z) < radius + 0.65;
}
