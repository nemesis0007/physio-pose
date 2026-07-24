import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { MetricKey, ScoringProfile } from "./exercise-data";

export type RepPhase =
  | "ready"
  | "moving"
  | "target"
  | "returning"
  | "holding";

export type PoseMetrics = {
  kneeAngle: number;
  kneeBend: number;
  hipAngle: number;
  shoulderAngle: number;
  elbowAngle: number;
  elbowBend: number;
  ankleAngle: number;
  trunkLean: number;
  pelvisTilt: number;
  wristSpan: number;
  kneeSpan: number;
  ankleSpan: number;
  heelLift: number;
  reachSpan: number;
  singleLegLift: number;
  confidence: number;
  side: "left" | "right";
};

export type RepTracker = {
  phase: RepPhase;
  extremeValue: number;
  maxCompensation: number;
  startedAt: number;
  holdStartedAt: number | null;
  cooldownUntil: number;
};

export type RepDecision = {
  accepted: boolean;
  score: number;
  primaryLabel: string;
  primaryValue: number;
  primaryUnit: "°" | "%";
  compensationLabel: string;
  compensationValue: number;
  compensationUnit: "°" | "%";
  targetText: string;
  reason: string;
  cue: string;
};

const INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

const REQUIRED_CONFIDENCE = 0.55;

function visibility(point: NormalizedLandmark) {
  return point.visibility ?? 1;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
  const cosine = clamp(numerator / Math.max(denominator, 1e-6), -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function getPoseMetrics(
  landmarks: NormalizedLandmark[],
): PoseMetrics | null {
  if (landmarks.length < 33) return null;

  const left = {
    shoulder: landmarks[INDEX.leftShoulder],
    elbow: landmarks[INDEX.leftElbow],
    wrist: landmarks[INDEX.leftWrist],
    hip: landmarks[INDEX.leftHip],
    knee: landmarks[INDEX.leftKnee],
    ankle: landmarks[INDEX.leftAnkle],
    heel: landmarks[INDEX.leftHeel],
    foot: landmarks[INDEX.leftFoot],
  };
  const right = {
    shoulder: landmarks[INDEX.rightShoulder],
    elbow: landmarks[INDEX.rightElbow],
    wrist: landmarks[INDEX.rightWrist],
    hip: landmarks[INDEX.rightHip],
    knee: landmarks[INDEX.rightKnee],
    ankle: landmarks[INDEX.rightAnkle],
    heel: landmarks[INDEX.rightHeel],
    foot: landmarks[INDEX.rightFoot],
  };

  const leftConfidence = average(
    Object.values(left).map((point) => visibility(point)),
  );
  const rightConfidence = average(
    Object.values(right).map((point) => visibility(point)),
  );
  const selected = leftConfidence >= rightConfidence ? left : right;
  const side = leftConfidence >= rightConfidence ? "left" : "right";
  const confidence = Math.max(leftConfidence, rightConfidence);

  const torsoLength = Math.max(
    distance(selected.shoulder, selected.hip),
    0.05,
  );
  const shoulderWidth = Math.max(
    distance(left.shoulder, right.shoulder),
    torsoLength * 0.45,
  );
  const legLength = Math.max(
    distance(selected.hip, selected.knee) +
      distance(selected.knee, selected.ankle),
    0.1,
  );

  const kneeAngle = angleAt(selected.hip, selected.knee, selected.ankle);
  const kneeBend = 180 - kneeAngle;
  const hipAngle = angleAt(
    selected.shoulder,
    selected.hip,
    selected.knee,
  );
  const shoulderAngle = angleAt(
    selected.elbow,
    selected.shoulder,
    selected.hip,
  );
  const elbowAngle = angleAt(
    selected.shoulder,
    selected.elbow,
    selected.wrist,
  );
  const elbowBend = 180 - elbowAngle;
  const ankleAngle = angleAt(
    selected.knee,
    selected.ankle,
    selected.foot,
  );
  const trunkLean =
    (Math.atan2(
      Math.abs(selected.shoulder.x - selected.hip.x),
      Math.abs(selected.shoulder.y - selected.hip.y),
    ) *
      180) /
    Math.PI;
  const pelvisTilt =
    (Math.atan2(Math.abs(left.hip.y - right.hip.y), torsoLength) * 180) /
    Math.PI;
  const wristSpan =
    (distance(left.wrist, right.wrist) / shoulderWidth) * 100;
  const kneeSpan = (distance(left.knee, right.knee) / shoulderWidth) * 100;
  const ankleSpan =
    (distance(left.ankle, right.ankle) / shoulderWidth) * 100;
  const heelLift =
    (Math.abs(selected.heel.y - selected.foot.y) / legLength) * 100;
  const reachSpan =
    (Math.max(
      distance(left.wrist, right.ankle),
      distance(right.wrist, left.ankle),
    ) /
      torsoLength) *
    100;
  const singleLegLift =
    (Math.abs(left.ankle.y - right.ankle.y) / legLength) * 100;

  return {
    kneeAngle,
    kneeBend,
    hipAngle,
    shoulderAngle,
    elbowAngle,
    elbowBend,
    ankleAngle,
    trunkLean,
    pelvisTilt,
    wristSpan,
    kneeSpan,
    ankleSpan,
    heelLift,
    reachSpan,
    singleLegLift,
    confidence,
    side,
  };
}

export function metricValue(metrics: PoseMetrics, key: MetricKey) {
  return metrics[key];
}

export function initialRepTracker(): RepTracker {
  return {
    phase: "ready",
    extremeValue: 0,
    maxCompensation: 0,
    startedAt: 0,
    holdStartedAt: null,
    cooldownUntil: 0,
  };
}

function hasStarted(value: number, profile: ScoringProfile) {
  return profile.direction === "increase"
    ? value >= profile.startThreshold
    : value <= profile.startThreshold;
}

function hasReachedTarget(value: number, profile: ScoringProfile) {
  return value >= profile.targetMin && value <= profile.targetMax;
}

function hasReturned(value: number, profile: ScoringProfile) {
  return profile.direction === "increase"
    ? value <= profile.returnThreshold
    : value >= profile.returnThreshold;
}

function nextExtreme(
  current: number,
  value: number,
  profile: ScoringProfile,
) {
  if (!current) return value;
  return profile.direction === "increase"
    ? Math.max(current, value)
    : Math.min(current, value);
}

function buildDecision(
  value: number,
  compensation: number,
  profile: ScoringProfile,
): RepDecision {
  const targetPassed = hasReachedTarget(value, profile);
  const compensationPassed = compensation <= profile.compensationMax;
  const accepted = targetPassed && compensationPassed;
  const center = (profile.targetMin + profile.targetMax) / 2;
  const halfRange = Math.max((profile.targetMax - profile.targetMin) / 2, 1);
  const targetScore = clamp(
    100 - (Math.abs(value - center) / halfRange) * 22,
    35,
    100,
  );
  const compensationScore = clamp(
    100 - (compensation / Math.max(profile.compensationMax, 1)) * 18,
    35,
    100,
  );
  const score = Math.round((targetScore * 0.7 + compensationScore * 0.3));

  let reason = `${profile.primaryLabel} reached the demo target while ${profile.compensationLabel.toLowerCase()} stayed controlled.`;
  let cue = "Good repetition.";

  if (!targetPassed) {
    reason = `${profile.primaryLabel} reached ${Math.round(value)}${profile.unit}; the demo target is ${profile.targetText}.`;
    cue = profile.rangeCue;
  } else if (!compensationPassed) {
    reason = `${profile.compensationLabel} reached ${Math.round(compensation)}${profile.compensationUnit}; the demo limit is ${profile.compensationMax}${profile.compensationUnit}.`;
    cue = profile.compensationCue;
  }

  return {
    accepted,
    score: accepted ? Math.max(score, 70) : Math.min(score, 69),
    primaryLabel: profile.primaryLabel,
    primaryValue: value,
    primaryUnit: profile.unit,
    compensationLabel: profile.compensationLabel,
    compensationValue: compensation,
    compensationUnit: profile.compensationUnit,
    targetText: profile.targetText,
    reason,
    cue,
  };
}

export function advanceProtocol(
  current: RepTracker,
  metrics: PoseMetrics,
  profile: ScoringProfile,
  now: number,
): { tracker: RepTracker; decision?: RepDecision } {
  if (metrics.confidence < REQUIRED_CONFIDENCE) return { tracker: current };
  if (now < current.cooldownUntil) return { tracker: current };

  const value = metricValue(metrics, profile.metric);
  const compensation = metricValue(metrics, profile.compensationMetric);

  if (profile.mode === "hold") {
    const inPosition = hasReachedTarget(value, profile);
    const controlled = compensation <= profile.compensationMax;

    if (!inPosition || !controlled) {
      return {
        tracker: {
          ...initialRepTracker(),
          maxCompensation: compensation,
        },
      };
    }

    const holdStartedAt = current.holdStartedAt ?? now;
    const tracker: RepTracker = {
      ...current,
      phase: "holding",
      extremeValue: value,
      maxCompensation: Math.max(current.maxCompensation, compensation),
      holdStartedAt,
    };

    if (now - holdStartedAt >= (profile.holdSeconds ?? 3) * 1000) {
      return {
        tracker: {
          ...initialRepTracker(),
          cooldownUntil: now + 1500,
        },
        decision: buildDecision(
          value,
          tracker.maxCompensation,
          profile,
        ),
      };
    }
    return { tracker };
  }

  if (current.phase === "ready" && hasStarted(value, profile)) {
    return {
      tracker: {
        ...current,
        phase: "moving",
        extremeValue: value,
        maxCompensation: compensation,
        startedAt: now,
      },
    };
  }

  if (current.phase === "ready") return { tracker: current };

  const tracker: RepTracker = {
    ...current,
    extremeValue: nextExtreme(current.extremeValue, value, profile),
    maxCompensation: Math.max(current.maxCompensation, compensation),
  };

  if (
    current.phase === "moving" &&
    hasReachedTarget(value, profile)
  ) {
    return { tracker: { ...tracker, phase: "target" } };
  }

  if (current.phase === "target" && hasReturned(value, profile)) {
    return { tracker: { ...tracker, phase: "returning" } };
  }

  if (current.phase === "returning") {
    return {
      tracker: {
        ...initialRepTracker(),
        cooldownUntil: now + 450,
      },
      decision: buildDecision(
        tracker.extremeValue,
        tracker.maxCompensation,
        profile,
      ),
    };
  }

  if (now - current.startedAt > 12000) {
    return { tracker: initialRepTracker() };
  }

  return { tracker };
}
