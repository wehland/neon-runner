import * as THREE from "three";
import { CAMERA_DISTANCE, CAMERA_FOLLOW, CAMERA_HEIGHT, FOG_COLOR, FOG_FAR, FOG_NEAR, HOVER_HEIGHT, MAX_DT } from "./config";
import { lerpExp } from "./collision";
import { offsetPoint } from "./course";
import { PlayerView } from "./Player";
import { GameSimulation } from "./simulation";
import { SpawnView } from "./Spawner";
import { Starfield } from "./Stars";
import { TrackView } from "./Track";
import { Hud } from "../ui/hud";
import { AudioEngine } from "../audio/engine";

export class Game {
  readonly sim: GameSimulation;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly player: PlayerView;
  readonly track: TrackView;
  readonly stars: Starfield;
  readonly spawns: SpawnView;
  readonly hud = new Hud();
  readonly audio = new AudioEngine();

  paused = false;
  private last = 0;
  private look = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private camUp = new THREE.Vector3(0, 1, 0);
  private lastHeading = 0;

  constructor(canvas: HTMLCanvasElement, sim = new GameSimulation()) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(FOG_COLOR, 1);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);

    this.scene.add(new THREE.HemisphereLight(0x9bb7ff, 0x0b1020, 0.85));
    const sun = new THREE.DirectionalLight(0xc8ddff, 0.75);
    sun.position.set(-8, 18, 6);
    this.scene.add(sun);

    this.player = new PlayerView();
    this.track = new TrackView();
    this.stars = new Starfield();
    this.spawns = new SpawnView();
    this.scene.add(this.player.group, this.track.group, this.stars.group, this.spawns.group);

    this.hud.bind(
      () => {
        this.audio.unlock();
        this.sim.start();
      },
      () => {
        this.audio.unlock();
        this.audio.ensureMusic();
        this.sim.reset();
      },
      () => {
        this.audio.unlock();
        this.audio.toggleMuted();
      },
    );
    this.sync(0);
  }

  startLoop(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(MAX_DT, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  step(dt: number): void {
    if (!this.paused) this.sim.tick(dt);
    this.audio.handle(this.sim.drainEvents());
    this.sync(dt);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width = window.innerWidth, height = window.innerHeight): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, this.camera);
  }

  objectCounts(): { meshes: number; children: number; segments: number } {
    let meshes = 0;
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Points).isPoints) meshes += 1;
    });
    return {
      meshes,
      children: this.scene.children.length,
      segments: this.sim.segments.length,
    };
  }

  private sync(dt: number): void {
    this.player.sync(this.sim, this.sim.time);
    this.track.sync(this.sim.segments);
    this.spawns.sync(this.sim, this.sim.obstacles, this.sim.orbs);
    const pose = this.sim.pose;
    const follow = dt || 0.016;
    const hover = HOVER_HEIGHT;
    const world = offsetPoint(pose, this.sim.x, this.sim.y + hover);
    const headingRate = (pose.heading - this.lastHeading) / follow;
    this.lastHeading = pose.heading;
    const bank = THREE.MathUtils.clamp(headingRate * 0.35, -0.18, 0.18);
    this.desired.set(
      world.x - pose.forward.x * CAMERA_DISTANCE + pose.up.x * CAMERA_HEIGHT + pose.right.x * this.sim.x * 0.12,
      world.y - pose.forward.y * CAMERA_DISTANCE + pose.up.y * CAMERA_HEIGHT + pose.right.y * this.sim.x * 0.12,
      world.z - pose.forward.z * CAMERA_DISTANCE + pose.up.z * CAMERA_HEIGHT + pose.right.z * this.sim.x * 0.12,
    );
    this.camera.position.x = lerpExp(this.camera.position.x, this.desired.x, CAMERA_FOLLOW, follow);
    this.camera.position.y = lerpExp(this.camera.position.y, this.desired.y, CAMERA_FOLLOW, follow);
    this.camera.position.z = lerpExp(this.camera.position.z, this.desired.z, CAMERA_FOLLOW * 1.15, follow);
    this.camUp.set(
      pose.up.x + pose.right.x * bank,
      pose.up.y + pose.right.y * bank,
      pose.up.z + pose.right.z * bank,
    ).normalize();
    this.camera.up.lerp(this.camUp, 0.12);
    this.look.set(
      world.x + pose.forward.x * 8 + pose.up.x * 0.6,
      world.y + pose.forward.y * 8 + pose.up.y * 0.6,
      world.z + pose.forward.z * 8 + pose.up.z * 0.6,
    );
    this.camera.lookAt(this.look);
    this.stars.sync(this.camera.position, pose.forward, this.sim.speed, dt);

    const snap = this.sim.snapshot();
    this.hud.sync({
      mode: snap.mode,
      lane: snap.lane,
      grounded: snap.grounded,
      energy: snap.energy,
      distance: snap.distance,
      speed: snap.speed,
      heading: snap.heading,
      elevation: snap.elevation,
      breakAhead: snap.breakAhead,
      obstacles: snap.obstacleCount,
      orbs: snap.orbCount,
      segments: snap.segmentCount,
      muted: this.audio.muted,
      audioUnlocked: this.audio.unlocked,
      lastSfx: this.audio.lastSfx,
      sfxJump: this.audio.counts.jump,
      sfxCollect: this.audio.counts.collect,
      sfxCrash: this.audio.counts.crash,
    });
  }
}
