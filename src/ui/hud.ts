export type HudState = {
  mode: string;
  lane: number;
  grounded: boolean;
  energy: number;
  distance: number;
  speed: number;
  heading: number;
  elevation: number;
  breakAhead: boolean;
  obstacles: number;
  orbs: number;
  segments: number;
  muted: boolean;
  audioUnlocked: boolean;
  lastSfx: string;
  sfxJump: number;
  sfxCollect: number;
  sfxCrash: number;
};

export class Hud {
  private readonly root: HTMLElement;
  private readonly distance: HTMLElement;
  private readonly energy: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly start: HTMLElement;
  private readonly gameover: HTMLElement;
  private readonly finalDistance: HTMLElement;
  private readonly finalEnergy: HTMLElement;
  private readonly sound: HTMLButtonElement;

  constructor() {
    this.root = el("hud");
    this.distance = el("hud-distance");
    this.energy = el("hud-energy");
    this.speed = el("hud-speed");
    this.start = el("overlay-start");
    this.gameover = el("overlay-gameover");
    this.finalDistance = el("final-distance");
    this.finalEnergy = el("final-energy");
    this.sound = el("btn-sound") as HTMLButtonElement;
  }

  bind(onStart: () => void, onAgain: () => void, onMute: () => void): void {
    el("btn-start").addEventListener("click", onStart);
    el("btn-again").addEventListener("click", onAgain);
    this.sound.addEventListener("click", onMute);
  }

  sync(state: HudState): void {
    this.root.dataset.mode = state.mode;
    this.root.dataset.lane = String(state.lane);
    this.root.dataset.grounded = state.grounded ? "true" : "false";
    this.root.dataset.energy = String(state.energy);
    this.root.dataset.distance = String(Math.floor(state.distance));
    this.root.dataset.speed = String(Math.round(state.speed));
    this.root.dataset.heading = state.heading.toFixed(3);
    this.root.dataset.elev = state.elevation.toFixed(2);
    this.root.dataset.breakAhead = state.breakAhead ? "true" : "false";
    this.root.dataset.obstacles = String(state.obstacles);
    this.root.dataset.orbs = String(state.orbs);
    this.root.dataset.segments = String(state.segments);
    this.root.dataset.muted = state.muted ? "true" : "false";
    this.root.dataset.audioUnlocked = state.audioUnlocked ? "true" : "false";
    this.root.dataset.lastSfx = state.lastSfx;
    this.root.dataset.sfxJump = String(state.sfxJump);
    this.root.dataset.sfxCollect = String(state.sfxCollect);
    this.root.dataset.sfxCrash = String(state.sfxCrash);

    this.sound.dataset.sound = state.muted ? "off" : "on";
    this.sound.textContent = state.muted ? "Sound: OFF" : "Sound: ON";

    this.distance.textContent = String(Math.floor(state.distance));
    this.energy.textContent = String(state.energy);
    this.speed.textContent = String(Math.round(state.speed));

    this.start.classList.toggle("hidden", state.mode !== "start");
    this.gameover.classList.toggle("hidden", state.mode !== "gameover");
    if (state.mode === "gameover") {
      this.finalDistance.textContent = String(Math.floor(state.distance));
      this.finalEnergy.textContent = String(state.energy);
    }
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}
