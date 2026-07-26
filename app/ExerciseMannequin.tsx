"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Exercise } from "./exercise-data";

type Pose = {
  rootY: number;
  rootX: number;
  rootZ: number;
  torsoX: number;
  torsoZ: number;
  leftShoulderX: number;
  leftShoulderZ: number;
  rightShoulderX: number;
  rightShoulderZ: number;
  leftElbowX: number;
  leftElbowZ: number;
  rightElbowX: number;
  rightElbowZ: number;
  leftHipX: number;
  leftHipZ: number;
  rightHipX: number;
  rightHipZ: number;
  leftKneeX: number;
  leftKneeZ: number;
  rightKneeX: number;
  rightKneeZ: number;
  leftAnkleX: number;
  leftAnkleZ: number;
  rightAnkleX: number;
  rightAnkleZ: number;
};

type Rig = {
  root: THREE.Group;
  torso: THREE.Group;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  rightHip: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightAnkle: THREE.Group;
  chair: THREE.Group;
  step: THREE.Mesh;
  wall: THREE.Mesh;
  mat: THREE.Mesh;
  bar: THREE.Group;
};

type Retarget = {
  pivot: THREE.Group;
  links: Array<{
    driver: THREE.Object3D;
    bone: THREE.Bone;
    driverRest: THREE.Quaternion;
    boneRest: THREE.Quaternion;
  }>;
};

const DEG = Math.PI / 180;

function realisticModelOffset(exerciseId: string) {
  if (CHAIR_IDS.has(exerciseId)) return new THREE.Vector3(0, 0.03, 0.14);
  if (exerciseId === "wall-slide") return new THREE.Vector3(0, 0, 0.08);
  return new THREE.Vector3();
}

const STANDING: Pose = {
  rootY: 0,
  rootX: 0,
  rootZ: 0,
  torsoX: 0,
  torsoZ: 0,
  leftShoulderX: 0,
  leftShoulderZ: 3,
  rightShoulderX: 0,
  rightShoulderZ: -3,
  leftElbowX: 0,
  leftElbowZ: 0,
  rightElbowX: 0,
  rightElbowZ: 0,
  leftHipX: 0,
  leftHipZ: 2,
  rightHipX: 0,
  rightHipZ: -2,
  leftKneeX: 0,
  leftKneeZ: 0,
  rightKneeX: 0,
  rightKneeZ: 0,
  leftAnkleX: 0,
  leftAnkleZ: 0,
  rightAnkleX: 0,
  rightAnkleZ: 0,
};

function pose(changes: Partial<Pose>): Pose {
  return { ...STANDING, ...changes };
}

function interpolatePose(from: Pose, to: Pose, progress: number): Pose {
  const eased = progress * progress * (3 - 2 * progress);
  const result = { ...from };
  for (const key of Object.keys(result) as Array<keyof Pose>) {
    result[key] = THREE.MathUtils.lerp(from[key], to[key], eased);
  }
  return result;
}

function applyCameraPreset(
  exerciseId: string,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
) {
  if (exerciseId === "push-up") {
    camera.position.set(4.9, 1.65, 0.15);
    controls.target.set(0, 0.72, 0);
  } else if (exerciseId === "pull-up") {
    camera.position.set(4.7, 2.55, 5.6);
    controls.target.set(0, 1.65, 0);
  } else {
    camera.position.set(3.8, 2.4, 5.4);
    controls.target.set(0, 1.2, 0);
  }
  camera.lookAt(controls.target);
  controls.update();
}

const FLOOR_IDS = new Set([
  "heel-slide",
  "straight-leg-raise",
  "glute-bridge",
  "clamshell",
  "hip-abduction",
  "pelvic-tilt",
  "cat-cow",
  "bird-dog",
  "prone-press-up",
  "push-up",
]);

const CHAIR_IDS = new Set([
  "chair-sit-to-stand",
  "seated-knee-extension",
  "ankle-pumps",
]);

function exerciseKeyframes(exerciseId: string): [Pose, Pose] {
  switch (exerciseId) {
    case "chair-sit-to-stand":
      return [
        STANDING,
        pose({
          rootY: -0.58,
          torsoX: 16,
          leftHipX: -72,
          rightHipX: -72,
          leftKneeX: 94,
          rightKneeX: 94,
          leftShoulderX: -18,
          rightShoulderX: -18,
        }),
      ];
    case "heel-slide":
      return [
        pose({ rootZ: -90, rootY: -0.72 }),
        pose({
          rootZ: -90,
          rootY: -0.72,
          rightHipZ: -42,
          rightKneeZ: 92,
        }),
      ];
    case "seated-knee-extension":
      return [
        pose({
          rootY: -0.5,
          leftHipX: -82,
          rightHipX: -82,
          leftKneeX: 88,
          rightKneeX: 88,
        }),
        pose({
          rootY: -0.5,
          leftHipX: -82,
          rightHipX: -82,
          leftKneeX: 88,
          rightKneeX: 2,
        }),
      ];
    case "straight-leg-raise":
      return [
        pose({ rootZ: -90, rootY: -0.72 }),
        pose({ rootZ: -90, rootY: -0.72, rightHipZ: -42 }),
      ];
    case "mini-squat":
      return [
        STANDING,
        pose({
          rootY: -0.3,
          torsoX: 8,
          leftHipX: -38,
          rightHipX: -38,
          leftKneeX: 48,
          rightKneeX: 48,
        }),
      ];
    case "step-up":
      return [
        STANDING,
        pose({
          rootY: 0.12,
          rightHipX: -72,
          rightKneeX: 90,
          leftKneeX: 12,
        }),
      ];
    case "glute-bridge":
      return [
        pose({
          rootZ: -90,
          rootY: -0.62,
          leftHipZ: -48,
          rightHipZ: -48,
          leftKneeZ: 92,
          rightKneeZ: 92,
        }),
        pose({
          rootZ: -90,
          rootY: -0.34,
          leftHipZ: -12,
          rightHipZ: -12,
          leftKneeZ: 72,
          rightKneeZ: 72,
        }),
      ];
    case "clamshell":
      return [
        pose({
          rootZ: -90,
          rootY: -0.65,
          leftHipZ: -40,
          rightHipZ: -40,
          leftKneeZ: 85,
          rightKneeZ: 85,
        }),
        pose({
          rootZ: -90,
          rootY: -0.65,
          leftHipZ: -40,
          rightHipZ: -40,
          leftHipX: 35,
          leftKneeZ: 85,
          rightKneeZ: 85,
        }),
      ];
    case "hip-abduction":
      return [
        pose({ rootZ: -90, rootY: -0.68 }),
        pose({ rootZ: -90, rootY: -0.68, leftHipX: 42 }),
      ];
    case "standing-hip-extension":
      return [STANDING, pose({ rightHipX: 28, torsoX: -2 })];
    case "pendulum":
      return [
        pose({ torsoX: 35, rightShoulderX: -18 }),
        pose({ torsoX: 35, rightShoulderX: 38 }),
      ];
    case "wall-slide":
      return [
        pose({
          leftShoulderZ: 45,
          rightShoulderZ: -45,
          leftElbowZ: 75,
          rightElbowZ: -75,
        }),
        pose({
          leftShoulderZ: 155,
          rightShoulderZ: -155,
          leftElbowZ: 8,
          rightElbowZ: -8,
        }),
      ];
    case "shoulder-abduction":
      return [
        STANDING,
        pose({ leftShoulderZ: 88, rightShoulderZ: -88 }),
      ];
    case "external-rotation":
      return [
        pose({
          leftShoulderZ: 12,
          rightShoulderZ: -12,
          leftElbowX: -78,
          rightElbowX: -78,
        }),
        pose({
          leftShoulderZ: 12,
          rightShoulderZ: -12,
          leftElbowX: -78,
          rightElbowX: -78,
          leftElbowZ: 52,
          rightElbowZ: -52,
        }),
      ];
    case "push-up":
      return [
        pose({
          rootX: 90,
          rootY: -0.52,
          leftShoulderX: -88,
          rightShoulderX: -88,
        }),
        pose({
          rootX: 90,
          rootY: -0.69,
          leftShoulderX: -56,
          rightShoulderX: -56,
          leftElbowX: -102,
          rightElbowX: -102,
        }),
      ];
    case "pull-up":
      return [
        pose({
          rootY: 0.2,
          leftShoulderZ: -112,
          rightShoulderZ: 112,
          leftElbowZ: 8,
          rightElbowZ: -8,
        }),
        pose({
          rootY: 0.54,
          leftShoulderZ: -105,
          rightShoulderZ: 105,
          leftElbowZ: 42,
          rightElbowZ: -42,
        }),
      ];
    case "pelvic-tilt":
      return [
        pose({
          rootZ: -90,
          rootY: -0.66,
          leftHipZ: -48,
          rightHipZ: -48,
          leftKneeZ: 92,
          rightKneeZ: 92,
        }),
        pose({
          rootZ: -84,
          rootY: -0.61,
          leftHipZ: -48,
          rightHipZ: -48,
          leftKneeZ: 92,
          rightKneeZ: 92,
        }),
      ];
    case "cat-cow":
      return [
        pose({
          rootZ: -90,
          rootY: -0.25,
          leftShoulderZ: -82,
          rightShoulderZ: -82,
          leftHipZ: 82,
          rightHipZ: 82,
          leftKneeZ: -88,
          rightKneeZ: -88,
        }),
        pose({
          rootZ: -90,
          rootY: -0.2,
          torsoZ: 13,
          leftShoulderZ: -82,
          rightShoulderZ: -82,
          leftHipZ: 82,
          rightHipZ: 82,
          leftKneeZ: -88,
          rightKneeZ: -88,
        }),
      ];
    case "bird-dog":
      return [
        pose({
          rootZ: -90,
          rootY: -0.25,
          leftShoulderZ: -82,
          rightShoulderZ: -82,
          leftHipZ: 82,
          rightHipZ: 82,
          leftKneeZ: -88,
          rightKneeZ: -88,
        }),
        pose({
          rootZ: -90,
          rootY: -0.25,
          leftShoulderZ: -165,
          rightShoulderZ: -82,
          leftHipZ: 82,
          rightHipZ: 8,
          leftKneeZ: -88,
          rightKneeZ: 0,
        }),
      ];
    case "prone-press-up":
      return [
        pose({
          rootZ: -90,
          rootY: -0.7,
          leftShoulderZ: -55,
          rightShoulderZ: -55,
          leftElbowZ: 105,
          rightElbowZ: 105,
        }),
        pose({
          rootZ: -72,
          rootY: -0.5,
          leftShoulderZ: -75,
          rightShoulderZ: -75,
          leftElbowZ: 15,
          rightElbowZ: 15,
        }),
      ];
    case "ankle-pumps":
      return [
        pose({
          rootY: -0.5,
          leftHipX: -82,
          rightHipX: -82,
          leftKneeX: 5,
          rightKneeX: 5,
          leftAnkleX: -24,
          rightAnkleX: -24,
        }),
        pose({
          rootY: -0.5,
          leftHipX: -82,
          rightHipX: -82,
          leftKneeX: 5,
          rightKneeX: 5,
          leftAnkleX: 25,
          rightAnkleX: 25,
        }),
      ];
    case "calf-raise":
      return [
        STANDING,
        pose({
          rootY: 0.18,
          leftAnkleX: -24,
          rightAnkleX: -24,
        }),
      ];
    case "ankle-inversion-eversion":
      return [
        pose({ leftAnkleZ: -16, rightAnkleZ: -16 }),
        pose({ leftAnkleZ: 16, rightAnkleZ: 16 }),
      ];
    case "tandem-stance":
      return [
        pose({ leftHipX: -12, rightHipX: 12 }),
        pose({ leftHipX: -12, rightHipX: 12, torsoZ: 2 }),
      ];
    case "single-leg-balance":
      return [
        pose({ rightHipX: -55, rightKneeX: 86 }),
        pose({ rightHipX: -58, rightKneeX: 90, torsoZ: 2 }),
      ];
    case "lateral-step":
      return [
        STANDING,
        pose({
          leftHipZ: 34,
          rightHipZ: -34,
          leftShoulderZ: 16,
          rightShoulderZ: -16,
        }),
      ];
    default:
      return [STANDING, pose({ rightShoulderZ: -90 })];
  }
}

function material(color: number, roughness = 0.72) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.04,
  });
}

function addSegment(
  parent: THREE.Group,
  length: number,
  radius: number,
  color: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length - radius * 2, 8, 16),
    material(color),
  );
  mesh.position.y = -length / 2;
  parent.add(mesh);
  return mesh;
}

function joint(parent: THREE.Group, radius: number) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 14),
    material(0xd7a57e, 0.58),
  );
  parent.add(mesh);
  return mesh;
}

function createRig(scene: THREE.Scene): Rig {
  const root = new THREE.Group();
  root.position.y = 1.34;
  scene.add(root);

  const pelvis = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.14, 8, 20),
    material(0x1d2633),
  );
  pelvis.rotation.z = Math.PI / 2;
  root.add(pelvis);

  const torso = new THREE.Group();
  root.add(torso);
  const torsoMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.64, 10, 24),
    material(0x3a7cff, 0.42),
  );
  torsoMesh.position.y = 0.48;
  torso.add(torsoMesh);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.11, 0.18, 16),
    material(0xd7a57e),
  );
  neck.position.y = 0.96;
  torso.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 18),
    material(0xd7a57e),
  );
  head.scale.set(0.84, 1.06, 0.9);
  head.position.y = 1.22;
  torso.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.226, 24, 18, 0, Math.PI * 2, 0, 1.45),
    material(0x1e2630, 0.9),
  );
  hair.scale.set(0.85, 1.02, 0.91);
  hair.position.set(0, 1.27, -0.015);
  torso.add(hair);
  for (const x of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 8),
      material(0x18202a, 0.5),
    );
    eye.position.set(x, 1.25, 0.195);
    torso.add(eye);
  }

  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-0.34, 0.82, 0);
  torso.add(leftShoulder);
  joint(leftShoulder, 0.105);
  addSegment(leftShoulder, 0.54, 0.09, 0x2f69dc);
  const leftElbow = new THREE.Group();
  leftElbow.position.y = -0.54;
  leftShoulder.add(leftElbow);
  joint(leftElbow, 0.085);
  addSegment(leftElbow, 0.48, 0.075, 0xd7a57e);
  const leftHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 16, 12),
    material(0xd7a57e),
  );
  leftHand.scale.set(0.8, 1.25, 0.6);
  leftHand.position.y = -0.53;
  leftElbow.add(leftHand);

  const rightShoulder = leftShoulder.clone();
  rightShoulder.position.x = 0.34;
  torso.add(rightShoulder);
  const rightElbow = rightShoulder.children[2] as THREE.Group;

  const leftHip = new THREE.Group();
  leftHip.position.set(-0.16, -0.08, 0);
  root.add(leftHip);
  joint(leftHip, 0.12);
  addSegment(leftHip, 0.68, 0.12, 0x202b38);
  const leftKnee = new THREE.Group();
  leftKnee.position.y = -0.68;
  leftHip.add(leftKnee);
  joint(leftKnee, 0.105);
  addSegment(leftKnee, 0.66, 0.095, 0xd7a57e);
  const leftAnkle = new THREE.Group();
  leftAnkle.position.y = -0.66;
  leftKnee.add(leftAnkle);
  joint(leftAnkle, 0.08);
  const leftFoot = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.095, 0.28, 6, 14),
    material(0xf7f9fc, 0.34),
  );
  leftFoot.rotation.x = Math.PI / 2;
  leftFoot.position.set(0, -0.05, 0.16);
  leftAnkle.add(leftFoot);

  const rightHip = leftHip.clone();
  rightHip.position.x = 0.16;
  root.add(rightHip);
  const rightKnee = rightHip.children[2] as THREE.Group;
  const rightAnkle = rightKnee.children[2] as THREE.Group;

  const chair = new THREE.Group();
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.12, 0.9),
    material(0xf7c873),
  );
  seat.position.set(0, 0.68, -0.45);
  chair.add(seat);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.85, 0.12),
    material(0xf7c873),
  );
  back.position.set(0, 1.08, -0.84);
  chair.add(back);
  for (const x of [-0.36, 0.36]) {
    for (const z of [-0.12, -0.76]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.68, 12),
        material(0x9a6f31),
      );
      leg.position.set(x, 0.34, z);
      chair.add(leg);
    }
  }
  scene.add(chair);

  const step = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.3, 0.78),
    material(0xf7c873),
  );
  // Keep the step in front of the planted foot. The realistic mesh has
  // considerably more foot depth than the original procedural mannequin.
  step.position.set(0, 0.15, 0.62);
  scene.add(step);

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 3.4, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xcfe7e4,
      transparent: true,
      opacity: 0.35,
    }),
  );
  wall.position.set(0, 1.45, -0.34);
  scene.add(wall);

  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.05, 3.6),
    material(0x68e3d2),
  );
  mat.position.y = 0.025;
  scene.add(mat);

  const bar = new THREE.Group();
  const crossbar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 2.8, 18),
    material(0x9bb5bd, 0.4),
  );
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, 3.08, 0.04);
  bar.add(crossbar);
  for (const x of [-1.32, 1.32]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.06, 3.2, 16),
      material(0x526f79, 0.55),
    );
    post.position.set(x, 1.6, -0.18);
    bar.add(post);
  }
  scene.add(bar);

  return {
    root,
    torso,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    chair,
    step,
    wall,
    mat,
    bar,
  };
}

function applyPose(rig: Rig, value: Pose) {
  rig.root.position.y = 1.34 + value.rootY;
  rig.root.rotation.set(
    value.rootX * DEG,
    0,
    value.rootZ * DEG,
  );
  rig.torso.rotation.set(value.torsoX * DEG, 0, value.torsoZ * DEG);
  rig.leftShoulder.rotation.set(
    value.leftShoulderX * DEG,
    0,
    value.leftShoulderZ * DEG,
  );
  rig.rightShoulder.rotation.set(
    value.rightShoulderX * DEG,
    0,
    value.rightShoulderZ * DEG,
  );
  rig.leftElbow.rotation.set(
    value.leftElbowX * DEG,
    0,
    value.leftElbowZ * DEG,
  );
  rig.rightElbow.rotation.set(
    value.rightElbowX * DEG,
    0,
    value.rightElbowZ * DEG,
  );
  rig.leftHip.rotation.set(
    value.leftHipX * DEG,
    0,
    value.leftHipZ * DEG,
  );
  rig.rightHip.rotation.set(
    value.rightHipX * DEG,
    0,
    value.rightHipZ * DEG,
  );
  rig.leftKnee.rotation.set(
    value.leftKneeX * DEG,
    0,
    value.leftKneeZ * DEG,
  );
  rig.rightKnee.rotation.set(
    value.rightKneeX * DEG,
    0,
    value.rightKneeZ * DEG,
  );
  rig.leftAnkle.rotation.set(
    value.leftAnkleX * DEG,
    0,
    value.leftAnkleZ * DEG,
  );
  rig.rightAnkle.rotation.set(
    value.rightAnkleX * DEG,
    0,
    value.rightAnkleZ * DEG,
  );
}

function setWorldQuaternion(object: THREE.Object3D, world: THREE.Quaternion) {
  const parentWorld = new THREE.Quaternion();
  object.parent?.getWorldQuaternion(parentWorld);
  object.quaternion.copy(parentWorld.invert().multiply(world));
}

function retargetPose(target: Retarget) {
  for (const link of target.links) {
    const driverWorld = link.driver.getWorldQuaternion(new THREE.Quaternion());
    const parentWorld =
      link.bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ??
      new THREE.Quaternion();
    const delta = driverWorld.multiply(link.driverRest.clone().invert());
    link.bone.quaternion.copy(
      parentWorld.invert().multiply(delta.multiply(link.boneRest)),
    );
    link.bone.updateMatrixWorld(true);
  }
}

async function loadRealisticHuman(scene: THREE.Scene, driver: Rig) {
  const gltf = await new GLTFLoader().loadAsync(
    "/models/physiotwin-human.glb",
  );
  const model = gltf.scene;
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.getSize(new THREE.Vector3()).y;
  model.scale.setScalar(2.68 / Math.max(height, 0.01));

  const pivot = new THREE.Group();
  scene.add(pivot);
  pivot.add(model);
  model.updateMatrixWorld(true);
  const pelvis = model.getObjectByName("pelvis") as THREE.Bone | undefined;
  if (!pelvis) throw new Error("The human model is missing its pelvis bone.");
  model.position.sub(pelvis.getWorldPosition(new THREE.Vector3()));
  pivot.position.copy(driver.root.position);

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((item) => {
        if (item instanceof THREE.MeshStandardMaterial) {
          item.envMapIntensity = 0.72;
          item.roughness = Math.max(item.roughness, 0.36);
        }
      });
    }
  });

  model.updateMatrixWorld(true);
  for (const [name, angle] of [
    ["upperarm_l", -Math.PI / 2],
    ["upperarm_r", Math.PI / 2],
  ] as Array<[string, number]>) {
    const bone = model.getObjectByName(name) as THREE.Bone | undefined;
    if (!bone) throw new Error(`The human model is missing ${name}.`);
    const rest = bone.getWorldQuaternion(new THREE.Quaternion());
    setWorldQuaternion(
      bone,
      new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle)
        .multiply(rest),
    );
    bone.updateMatrixWorld(true);
  }

  applyPose(driver, STANDING);
  driver.root.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const pairs: Array<[THREE.Object3D, string]> = [
    [driver.torso, "spine_01"],
    [driver.leftShoulder, "upperarm_l"],
    [driver.rightShoulder, "upperarm_r"],
    [driver.leftElbow, "lowerarm_l"],
    [driver.rightElbow, "lowerarm_r"],
    [driver.leftHip, "thigh_l"],
    [driver.rightHip, "thigh_r"],
    [driver.leftKnee, "calf_l"],
    [driver.rightKnee, "calf_r"],
    [driver.leftAnkle, "foot_l"],
    [driver.rightAnkle, "foot_r"],
  ];
  const links = pairs.map(([driverJoint, name]) => {
    const bone = model.getObjectByName(name) as THREE.Bone | undefined;
    if (!bone) throw new Error(`The human model is missing ${name}.`);
    return {
      driver: driverJoint,
      bone,
      driverRest: driverJoint.getWorldQuaternion(new THREE.Quaternion()),
      boneRest: bone.getWorldQuaternion(new THREE.Quaternion()),
    };
  });

  driver.root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.visible = false;
  });
  return { pivot, links } satisfies Retarget;
}

export function ExerciseMannequin({ exercise }: { exercise: Exercise }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const exerciseIdRef = useRef(exercise.id);
  const playingRef = useRef(true);
  const speedRef = useRef(0.65);
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(true);

  useEffect(() => {
    exerciseIdRef.current = exercise.id;
    const rig = rigRef.current;
    if (rig) {
      rig.chair.visible = CHAIR_IDS.has(exercise.id);
      rig.step.visible = exercise.id === "step-up";
      rig.wall.visible = exercise.id === "wall-slide";
      rig.mat.visible = FLOOR_IDS.has(exercise.id);
      rig.bar.visible = exercise.id === "pull-up";
    }
    if (cameraRef.current && controlsRef.current) {
      applyCameraPreset(
        exercise.id,
        cameraRef.current,
        controlsRef.current,
      );
    }
  }, [exercise.id]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    speedRef.current = slow ? 0.65 : 1.05;
  }, [slow]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    scene.fog = new THREE.Fog(0x0b0d12, 7, 12);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(3.8, 2.4, 5.4);
    camera.lookAt(0, 1.25, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    cameraRef.current = camera;
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI / 2.02;
    applyCameraPreset(exerciseIdRef.current, camera, controls);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x15213a, 2.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x75a7ff, 1.7);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 64),
      new THREE.MeshStandardMaterial({
        color: 0x111722,
        roughness: 0.9,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(7, 14, 0x335184, 0x172238);
    grid.position.y = 0.005;
    scene.add(grid);

    const rig = createRig(scene);
    let realistic: Retarget | null = null;
    rigRef.current = rig;
    rig.chair.visible = CHAIR_IDS.has(exerciseIdRef.current);
    rig.step.visible = exerciseIdRef.current === "step-up";
    rig.wall.visible = exerciseIdRef.current === "wall-slide";
    rig.mat.visible = FLOOR_IDS.has(exerciseIdRef.current);
    rig.bar.visible = exerciseIdRef.current === "pull-up";
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    void loadRealisticHuman(scene, rig)
      .then((loaded) => {
        realistic = loaded;
      })
      .catch((problem) => {
        console.warn(
          "Realistic model unavailable; using fallback mannequin.",
          problem,
        );
      });

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const clock = new THREE.Clock();
    let elapsed = 0;
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      if (playingRef.current) elapsed += delta * speedRef.current;
      const wave = (Math.sin(elapsed * Math.PI) + 1) / 2;
      const [from, to] = exerciseKeyframes(exerciseIdRef.current);
      applyPose(rig, interpolatePose(from, to, wave));
      if (realistic) {
        realistic.pivot.position
          .copy(rig.root.position)
          .add(realisticModelOffset(exerciseIdRef.current));
        realistic.pivot.rotation.copy(rig.root.rotation);
        realistic.pivot.updateMatrixWorld(true);
        retargetPose(realistic);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((item) => item.dispose());
        }
      });
      rigRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  return (
    <section className="mannequin-section" id="exercise-demo">
      <div className="mannequin-copy">
        <p className="eyebrow">INTERACTIVE 3D MOVEMENT GUIDE</p>
        <h2>
          See the motion before you <em>perform it.</em>
        </h2>
        <p>
          A Blender-optimized, anatomically proportioned human demonstrates
          every protocol. Drag to rotate, scroll to zoom, and slow the movement
          down before recording.
        </p>
        <div className="demo-protocol">
          <span>NOW SHOWING</span>
          <strong>{exercise.name}</strong>
          <p>{exercise.cue}</p>
        </div>
        <div className="mannequin-controls">
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? "Pause animation" : "Play animation"}
          </button>
          <button
            type="button"
            className={slow ? "active" : ""}
            onClick={() => setSlow((current) => !current)}
          >
            {slow ? "Slow speed" : "Normal speed"}
          </button>
        </div>
        <small>
          Visual guide only. Follow the range, support and dosage prescribed by
          a physiotherapist, and stop if you feel pain.
        </small>
      </div>
      <div className="mannequin-stage">
        <div ref={hostRef} className="mannequin-canvas" />
        <div className="model-badge">
          <span className="privacy-dot" /> Rigged human model · Blender optimized
        </div>
        <div className="drag-hint">DRAG TO ROTATE · SCROLL TO ZOOM</div>
      </div>
    </section>
  );
}
