import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceProtocol,
  getPoseMetrics,
  initialRepTracker,
  smoothPoseMetrics,
} from "../app/movement.ts";

const profile = {
  mode: "rep",
  metric: "kneeAngle",
  primaryLabel: "Knee angle",
  unit: "°",
  direction: "decrease",
  startThreshold: 145,
  targetMin: 80,
  targetMax: 110,
  returnThreshold: 155,
  targetText: "80–110°",
  compensationMetric: "trunkLean",
  compensationLabel: "Trunk lean",
  compensationUnit: "°",
  compensationMax: 20,
  rangeCue: "Lower farther.",
  compensationCue: "Stay upright.",
};

function metrics(kneeAngle, trunkLean = 5) {
  return { kneeAngle, trunkLean, confidence: 0.95 };
}

function step(tracker, value, now) {
  return advanceProtocol(tracker, metrics(value), profile, now);
}

const LEFT_LANDMARKS = [11, 13, 15, 23, 25, 27, 29, 31];
const RIGHT_LANDMARKS = [12, 14, 16, 24, 26, 28, 30, 32];

function landmarkFrame(leftVisibility, rightVisibility) {
  const landmarks = Array.from({ length: 33 }, (_, index) => ({
    x: 0.12 + (index % 6) * 0.12,
    y: 0.12 + Math.floor(index / 6) * 0.12,
    z: (index % 3) * 0.01,
    visibility: 0.95,
  }));
  for (const index of LEFT_LANDMARKS) {
    landmarks[index].visibility = leftVisibility;
  }
  for (const index of RIGHT_LANDMARKS) {
    landmarks[index].visibility = rightVisibility;
  }
  return landmarks;
}

test("does not count when tracking begins halfway through a rep", () => {
  let tracker = initialRepTracker();
  for (let frame = 0; frame < 12; frame += 1) {
    const result = step(tracker, frame < 6 ? 100 : 170, frame * 100);
    tracker = result.tracker;
    assert.equal(result.decision, undefined);
  }
  assert.equal(tracker.armed, true);
  assert.equal(tracker.phase, "ready");
});

test("counts one complete neutral-target-neutral cycle", () => {
  let tracker = initialRepTracker();
  let decisions = 0;
  const samples = [
    [170, 0], [170, 100], [170, 200],
    [135, 400], [130, 500], [125, 600],
    [100, 800], [100, 900], [100, 1000],
    [165, 1200], [165, 1300], [165, 1400], [165, 1500],
    [165, 1600], [165, 1700],
  ];
  for (const [value, now] of samples) {
    const result = step(tracker, value, now);
    tracker = result.tracker;
    if (result.decision) decisions += 1;
  }
  assert.equal(decisions, 1);
});

test("rejects an unrealistically fast threshold bounce", () => {
  let tracker = initialRepTracker();
  let decisions = 0;
  const samples = [
    [170, 0], [170, 50], [170, 100],
    [130, 150], [125, 200], [120, 250],
    [100, 300], [100, 350], [100, 400],
    [165, 450], [165, 500], [165, 550],
  ];
  for (const [value, now] of samples) {
    const result = step(tracker, value, now);
    tracker = result.tracker;
    if (result.decision) decisions += 1;
  }
  assert.equal(decisions, 0);
});

test("keeps the tracked side stable through small visibility changes", () => {
  const initial = getPoseMetrics(landmarkFrame(0.86, 0.8));
  assert.equal(initial?.side, "left");

  const nearlyEven = getPoseMetrics(
    landmarkFrame(0.78, 0.84),
    undefined,
    initial?.side,
  );
  assert.equal(nearlyEven?.side, "left");
  assert.equal(Number(nearlyEven?.confidence.toFixed(2)), 0.78);

  const clearlyBetterRight = getPoseMetrics(
    landmarkFrame(0.64, 0.92),
    undefined,
    nearlyEven?.side,
  );
  assert.equal(clearlyBetterRight?.side, "right");
});

test("dampens low-confidence angle changes more than clear frames", () => {
  const measured = getPoseMetrics(landmarkFrame(0.95, 0.72));
  assert.ok(measured);
  const previous = { ...measured, kneeAngle: 170 };
  const lowConfidence = smoothPoseMetrics(previous, {
    ...measured,
    kneeAngle: 90,
    confidence: 0.66,
  });
  const highConfidence = smoothPoseMetrics(previous, {
    ...measured,
    kneeAngle: 90,
    confidence: 0.98,
  });

  assert.ok(lowConfidence.kneeAngle < previous.kneeAngle);
  assert.ok(highConfidence.kneeAngle < lowConfidence.kneeAngle);
  assert.equal(lowConfidence.confidence, 0.66);
});
