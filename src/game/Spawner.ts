import * as THREE from "three";
import { OBSTACLE_POOL, ORB_POOL } from "./config";
import { lanePoint } from "./course";
import type { GameSimulation } from "./simulation";
import type { ObstacleState, OrbState } from "./simulation";

export class SpawnView {
  readonly group = new THREE.Group();
  private readonly obstacles: THREE.Group[] = [];
  private readonly orbs: THREE.Mesh[] = [];
  private readonly lowMat: THREE.MeshStandardMaterial;
  private readonly tallMat: THREE.MeshStandardMaterial;

  constructor() {
    this.lowMat = new THREE.MeshStandardMaterial({
      color: 0x243048,
      metalness: 0.55,
      roughness: 0.32,
      emissive: 0xff3fd4,
      emissiveIntensity: 0.45,
    });
    this.tallMat = new THREE.MeshStandardMaterial({
      color: 0x1a2236,
      metalness: 0.6,
      roughness: 0.28,
      emissive: 0x32f0ff,
      emissiveIntensity: 0.35,
    });
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x7ef6ff,
      emissive: 0x32f0ff,
      emissiveIntensity: 1.8,
      metalness: 0.1,
      roughness: 0.2,
    });

    for (let i = 0; i < OBSTACLE_POOL; i++) {
      const item = new THREE.Group();
      const low = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.95, 1.1), this.lowMat);
      low.name = "low";
      low.position.y = 0.475;
      const tall = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.55, 1.15), this.tallMat);
      tall.name = "tall";
      tall.position.y = 1.275;
      item.add(low, tall);
      item.visible = false;
      this.group.add(item);
      this.obstacles.push(item);
    }

    for (let i = 0; i < ORB_POOL; i++) {
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), orbMat);
      orb.visible = false;
      this.group.add(orb);
      this.orbs.push(orb);
    }
  }

  sync(sim: GameSimulation, obstacles: ObstacleState[], orbs: OrbState[]): void {
    for (let i = 0; i < this.obstacles.length; i++) {
      const state = obstacles[i];
      const mesh = this.obstacles[i];
      mesh.visible = state.active;
      if (!state.active) continue;
      const pose = sim.course.poseAt(state.z);
      const p = lanePoint(pose, state.lane, 0);
      mesh.position.set(p.x, p.y, p.z);
      mesh.up.set(pose.up.x, pose.up.y, pose.up.z);
      mesh.lookAt(p.x + pose.forward.x, p.y + pose.forward.y, p.z + pose.forward.z);
      const low = mesh.getObjectByName("low") as THREE.Mesh;
      const tall = mesh.getObjectByName("tall") as THREE.Mesh;
      low.visible = state.kind === "low";
      tall.visible = state.kind === "tall";
    }

    for (let i = 0; i < this.orbs.length; i++) {
      const state = orbs[i];
      const mesh = this.orbs[i];
      mesh.visible = state.active;
      if (!state.active) continue;
      const pose = sim.course.poseAt(state.z);
      const bob = 1.15 + Math.sin(state.phase) * 0.18;
      const p = lanePoint(pose, state.lane, bob);
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.y = state.phase;
      mesh.rotation.x = state.phase * 0.4;
    }
  }
}
