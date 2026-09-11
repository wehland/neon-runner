export type SfxName = "jump" | "collect" | "crash";

export type AudioEvents = {
  jumped: boolean;
  collected: number;
  crashed: boolean;
};

function makeAudio(src: string, volume: number, loop = false): HTMLAudioElement {
  const el = new Audio(src);
  el.preload = "auto";
  el.loop = loop;
  el.volume = volume;
  el.setAttribute("playsinline", "true");
  return el;
}

function safePlay(el: HTMLAudioElement): void {
  const p = el.play();
  if (p && typeof p.catch === "function") p.catch(() => undefined);
}

function seekStart(el: HTMLAudioElement): void {
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    // Seek can throw before metadata is ready.
  }
}

function restart(el: HTMLAudioElement): void {
  seekStart(el);
  const p = el.play();
  if (!p || typeof p.catch !== "function") return;
  p.catch(() => {
    const clone = el.cloneNode(true) as HTMLAudioElement;
    clone.volume = el.volume;
    clone.muted = el.muted;
    safePlay(clone);
  });
}

export class AudioEngine {
  muted = false;
  unlocked = false;
  lastSfx: SfxName | "none" = "none";
  readonly counts = { jump: 0, collect: 0, crash: 0 };

  private readonly music: HTMLAudioElement;
  private readonly jump: HTMLAudioElement;
  private readonly crash: HTMLAudioElement;
  private readonly collectPool: HTMLAudioElement[];
  private collectIndex = 0;
  private readonly all: HTMLAudioElement[];

  constructor() {
    this.music = makeAudio("/audio/bgm.ogg", 0.22, true);
    this.jump = makeAudio("/audio/jump.ogg", 0.5);
    this.crash = makeAudio("/audio/crash.ogg", 0.6);
    this.collectPool = [
      makeAudio("/audio/collect.ogg", 0.5),
      makeAudio("/audio/collect.ogg", 0.5),
      makeAudio("/audio/collect.ogg", 0.5),
    ];
    this.all = [this.music, this.jump, this.crash, ...this.collectPool];
  }

  unlock(): void {
    if (this.unlocked) {
      this.ensureMusic();
      return;
    }
    this.unlocked = true;
    for (const el of this.all) {
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          seekStart(el);
          el.muted = this.muted;
          this.ensureMusic();
        }).catch(() => {
          el.muted = this.muted;
        });
      } else {
        seekStart(el);
        el.muted = this.muted;
      }
    }
    this.ensureMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const el of this.all) el.muted = muted;
    if (!muted) this.ensureMusic();
    else this.music.pause();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  handle(events: AudioEvents): void {
    if (events.jumped) this.playSfx("jump");
    for (let i = 0; i < events.collected; i++) this.playSfx("collect");
    if (events.crashed) this.playSfx("crash");
  }

  playSfx(name: SfxName): void {
    this.lastSfx = name;
    this.counts[name] += 1;
    if (!this.unlocked || this.muted) return;
    if (name === "jump") {
      restart(this.jump);
      return;
    }
    if (name === "crash") {
      restart(this.crash);
      return;
    }
    const clip = this.collectPool[this.collectIndex % this.collectPool.length];
    this.collectIndex += 1;
    restart(clip);
  }

  ensureMusic(): void {
    if (!this.unlocked || this.muted) return;
    if (this.music.ended) {
      try {
        this.music.currentTime = 0;
      } catch {
        // Seek can throw before metadata is ready.
      }
    }
    if (this.music.paused) safePlay(this.music);
  }
}
