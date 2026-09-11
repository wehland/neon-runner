import * as THREE from "three";
import { RAIL_WIDTH, SEGMENT_COUNT, SEGMENT_LENGTH, TRACK_THICKNESS } from "./config";
import { laneToX } from "./collision";
import type { SegmentState } from "./simulation";

function makeNeonMaterial(color: number, intensity = 1.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.12,
    roughness: 0.28,
  });
}

type RailView = {
  group: THREE.Group;
  rail: THREE.Mesh;
  strip: THREE.Mesh;
  cap: THREE.Mesh;
};

export class TrackView {
  readonly group = new THREE.Group();
  private readonly segments: THREE.Group[] = [];
  private readonly rails: RailView[][] = [];

  constructor() {
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x1a2438,
      metalness: 0.4,
      roughness: 0.5,
    });
    const cyan = makeNeonMaterial(0x32f0ff);
    const magenta = makeNeonMaterial(0xff3fd4);
    const capCyan = makeNeonMaterial(0x9effff, 3.4);
    const capMagenta = makeNeonMaterial(0xff9ae8, 3.4);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x151c2c,
      metalness: 0.5,
      roughness: 0.4,
      emissive: 0x091018,
      emissiveIntensity: 0.6,
    });
    const lanes = [-1, 0, 1];
    const colors = [cyan, magenta, cyan];
    const caps = [capCyan, capMagenta, capCyan];

    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const segment = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), pillarMat);
      pillar.position.y = -1.4;
      segment.add(pillar);

      const railViews: RailView[] = [];
      for (let r = 0; r < 3; r++) {
        const railGroup = new THREE.Group();
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(RAIL_WIDTH, TRACK_THICKNESS, SEGMENT_LENGTH),
          deckMat,
        );
        rail.position.y = -TRACK_THICKNESS / 2;
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.05, SEGMENT_LENGTH - 0.35),
          colors[r],
        );
        strip.position.y = 0.03;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(RAIL_WIDTH + 0.08, 0.38, 0.2), caps[r]);
        cap.position.set(0, 0.08, SEGMENT_LENGTH / 2 - 0.05);
        railGroup.position.x = laneToX(lanes[r]);
        railGroup.add(rail, strip, cap);
        segment.add(railGroup);
        railViews.push({ group: railGroup, rail, strip, cap });
      }

      this.group.add(segment);
      this.segments.push(segment);
      this.rails.push(railViews);
    }
  }

  sync(states: SegmentState[]): void {
    for (let i = 0; i < this.segments.length; i++) {
      const state = states[i];
      const segment = this.segments[i];
      const pose = state.pose;
      segment.position.set(pose.x, pose.y, pose.z);
      segment.up.set(pose.up.x, pose.up.y, pose.up.z);
      segment.lookAt(
        pose.x + pose.forward.x,
        pose.y + pose.forward.y,
        pose.z + pose.forward.z,
      );
      const railViews = this.rails[i];
      for (let r = 0; r < 3; r++) {
        const present = state.lanes[r];
        railViews[r].group.visible = present;
        railViews[r].cap.visible = present && !state.nextLanes[r];
      }
    }
  }
}
