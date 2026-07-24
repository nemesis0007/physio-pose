import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type RepPhase =
  | "ready"
  | "descending"
  | "bottom"
  | "ascending";

export type PoseMetrics = {
  kneeAngle: number;
  trunkLean: number;
  confidence: number;
  side: "left" | "right";
};

export type RepTracker = {
  phase: RepPhase;
  minKneeAngle: number;
  maxTrunkLean: number;
};

export type RepDecision = {
  accepted: boolean;
  minKneeAngle: number;
  maxTrunkLean: number;
  reason: string;
  cue: string;
};

const INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const REQUIRED_CONFIDENCE = 0.55;

function visibility(point: NormalizedLandmark) {
  return point.visibility ?? 1;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function angleAt(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark,
) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const numerator = ba.x * bc.x + ba.y * bc.y;
  const denominator = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y);
  const cosine = Math.max(-1, Math.min(1, numerator / Math.max(denominator, 1e-6)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function getPoseMetrics(
  landmarks: NormalizedLandmark[],
): PoseMetrics | null {
  if (landmarks.length < 29) return null;

  const left = [
    landmarks[INDEX.leftShoulder],
    landmarks[INDEX.leftHip],
    landmarks[INDEX.leftKnee],
    landmarks[INDEX.leftAnkle],
  ];
  const right = [
    landmarks[INDEX.rightShoulder],
    landmarks[INDEX.rightHip],
    landmarks[INDEX.rightKnee],
    landmarks[INDEX.rightAnkle],
  ];
  const leftConfidence = average(left.map(visibility));
  const rightConfidence = average(right.map(visibility));
  const selected = leftConfidence >= rightConfidence ? left : right;
  const side = leftConfidence >= rightConfidence ? "left" : "right";
  const confidence = Math.max(leftConfidence, rightConfidence);

  const [shoulder, hip, knee, ankle] = selected;
  const kneeAngle = angleAt(hip, knee, ankle);
  const trunkDx = shoulder.x - hip.x;
  const trunkDy = shoulder.y - hip.y;
  const trunkLean = (Math.atan2(Math.abs(trunkDx), Math.abs(trunkDy)) * 180) / Math.PI;

  return { kneeAngle, trunkLean, confidence, side };
}

export function initialRepTracker(): RepTracker {
  return { phase: "ready", minKneeAngle: 180, maxTrunkLean: 0 };
}

export function advanceRep(
  current: RepTracker,
  metrics: PoseMetrics,
): { tracker: RepTracker; decision?: RepDecision } {
  if (metrics.confidence < REQUIRED_CONFIDENCE) return { tracker: current };

  const tracker = {
    ...current,
    minKneeAngle: Math.min(current.minKneeAngle, metrics.kneeAngle),
    maxTrunkLean: Math.max(current.maxTrunkLean, metrics.trunkLean),
  };

  if (current.phase === "ready" && metrics.kneeAngle < 145) {
    return {
      tracker: {
        phase: "descending",
        minKneeAngle: metrics.kneeAngle,
        maxTrunkLean: metrics.trunkLean,
      },
    };
  }

  if (current.phase === "descending" && metrics.kneeAngle < 110) {
    return { tracker: { ...tracker, phase: "bottom" } };
  }

  if (current.phase === "bottom" && metrics.kneeAngle > 125) {
    return { tracker: { ...tracker, phase: "ascending" } };
  }

  if (current.phase === "ascending" && metrics.kneeAngle > 155) {
    const romPassed = tracker.minKneeAngle >= 80 && tracker.minKneeAngle <= 110;
    const trunkPassed = tracker.maxTrunkLean <= 15;
    const accepted = romPassed && trunkPassed;
    let reason = "Movement stayed inside the prescribed bounds.";
    let cue = "Good repetition.";

    if (!romPassed) {
      reason = "Knee range was outside the 80–110 degree demo target.";
      cue = "Move only through your prescribed range.";
    } else if (!trunkPassed) {
      reason = `Trunk compensation reached ${Math.round(tracker.maxTrunkLean)} degrees.`;
      cue = "Keep your chest tall and retry.";
    }

    return {
      tracker: initialRepTracker(),
      decision: {
        accepted,
        minKneeAngle: tracker.minKneeAngle,
        maxTrunkLean: tracker.maxTrunkLean,
        reason,
        cue,
      },
    };
  }

  return { tracker };
}
