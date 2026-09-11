import * as THREE from "three";
import { HOVER_HEIGHT } from "./config";
import { offsetPoint } from "./course";
import type { GameSimulation } from "./simulation";

export class PlayerView {
  readonly group = new THREE.Group();

  constructor() {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.28, 1.25),
      new THREE.MeshStandardMaterial({
        color: 0x1a2a44,
        metalness: 0.55,
        roughness: 0.35,
        emissive: 0x062033,
        emissiveIntensity: 0.4,
      }),
    );
    body.position.y = 0.08;

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x7ef6ff,
        metalness: 0.2,
        roughness: 0.15,
        emissive: 0x1ad8ff,
        emissiveIntensity: 0.7,
      }),
    );
    canopy.position.set(0, 0.28, 0.18);
    canopy.scale.set(1.15, 0.7, 1.3);

    const finMat = new THREE.MeshStandardMaterial({
      color: 0x101820,
      metalness: 0.4,
      roughness: 0.45,
      emissive: 0xff2ec8,
      emissiveIntensity: 0.35,
    });
    const leftFin = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.7), finMat);
    leftFin.position.set(-0.52, 0.06, -0.05);
    leftFin.rotation.z = 0.35;
    const rightFin = leftFin.clone();
    rightFin.position.x = 0.52;
    rightFin.rotation.z = -0.35;

    const engine = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.18, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0x041018,
        emissive: 0x32f0ff,
        emissiveIntensity: 1.6,
        metalness: 0.1,
        roughness: 0.3,
      }),
    );
    engine.position.set(0, 0.04, -0.68);

    this.group.add(body, canopy, leftFin, rightFin, engine);
  }

  sync(sim: GameSimulation, time: number): void {
    const hover = HOVER_HEIGHT + Math.sin(time * 6.2) * 0.05;
    const pose = sim.pose;
    const p = offsetPoint(pose, sim.x, sim.y + hover);
    this.group.position.set(p.x, p.y, p.z);
    this.group.up.set(pose.up.x, pose.up.y, pose.up.z);
    this.group.lookAt(p.x + pose.forward.x, p.y + pose.forward.y, p.z + pose.forward.z);
    this.group.rotateZ(-sim.x * 0.05);
    if (!sim.grounded) this.group.rotateX(Math.max(-0.25, sim.vy * 0.02));
  }
}
