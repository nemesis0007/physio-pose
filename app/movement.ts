import type {
  Landmark,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
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
  leftKneeAngle: number;
  rightKneeAngle: number;
  leftElbowBend: number;
  rightElbowBend: number;
  leftShoulderAngle: number;
  rightShoulderAngle: number;
  leftHipAngle: number;
  rightHipAngle: number;
  symmetryScore: number;
};

export type RepTracker = {
  phase: RepPhase;
  armed: boolean;
  extremeValue: number;
  maxCompensation: number;
  startedAt: number;
  holdStartedAt: number | null;
  cooldownUntil: number;
  pendingTransition: "start" | "target" | "return" | "hold" | null;
  pendingFrames: number;
  phaseEnteredAt: number;
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

export const REQUIRED_CONFIDENCE = 0.65;
const REQUIRED_TRANSITION_FRAMES = 3;
const MIN_MOVEMENT_PHASE_MS = 180;
const MIN_TARGET_PHASE_MS = 160;
const MIN_COMPLETE_REP_MS = 650;
const CORE_LANDMARKS = [11, 12, 23, 24, 25, 26, 27, 28] as const;

function visibility(point: NormalizedLandmark) {
  return point.visibility ?? 1;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function validatePoseFrame(landmarks: NormalizedLandmark[]) {
  if (landmarks.length < 33) {
    return { valid: false, reason: "No complete pose was found." };
  }

  const core = CORE_LANDMARKS.map((index) => landmarks[index]);
  const visibleCore = core.filter((point) => visibility(point) >= 0.6);
  if (visibleCore.length < 6) {
    return {
      valid: false,
      reason: "Keep both shoulders, hips, knees and ankles visible.",
    };
  }

  const inFrame = visibleCore.filter(
    (point) =>
      point.x >= 0.015 &&
      point.x <= 0.985 &&
      point.y >= 0.015 &&
      point.y <= 0.985,
  );
  if (inFrame.length < 6) {
    return {
      valid: false,
      reason: "Step back so the full movement stays inside the frame.",
    };
  }

  const xValues = visibleCore.map((point) => point.x);
  const yValues = visibleCore.map((point) => point.y);
  const poseSpan = Math.max(
    Math.max(...xValues) - Math.min(...xValues),
    Math.max(...yValues) - Math.min(...yValues),
  );
  if (poseSpan < 0.3) {
    return {
      valid: false,
      reason: "Move closer so the body is large enough to measure.",
    };
  }

  return { valid: true, reason: "" };
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function angleAt(
  a: Pick<Landmark, "x" | "y" | "z">,
  b: Pick<Landmark, "x" | "y" | "z">,
  c: Pick<Landmark, "x" | "y" | "z">,
) {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const numerator = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const denominator =
    Math.hypot(ba.x, ba.y, ba.z) * Math.hypot(bc.x, bc.y, bc.z);
  const cosine = clamp(numerator / Math.max(denominator, 1e-6), -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function getPoseMetrics(
  landmarks: NormalizedLandmark[],
  worldLandmarks?: Landmark[],
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
  const spatial = worldLandmarks?.length === 33 ? worldLandmarks : landmarks;
  const spatialLeft = {
    shoulder: spatial[INDEX.leftShoulder],
    elbow: spatial[INDEX.leftElbow],
    wrist: spatial[INDEX.leftWrist],
    hip: spatial[INDEX.leftHip],
    knee: spatial[INDEX.leftKnee],
    ankle: spatial[INDEX.leftAnkle],
    foot: spatial[INDEX.leftFoot],
  };
  const spatialRight = {
    shoulder: spatial[INDEX.rightShoulder],
    elbow: spatial[INDEX.rightElbow],
    wrist: spatial[INDEX.rightWrist],
    hip: spatial[INDEX.rightHip],
    knee: spatial[INDEX.rightKnee],
    ankle: spatial[INDEX.rightAnkle],
    foot: spatial[INDEX.rightFoot],
  };

  const leftConfidence = average(
    Object.values(left).map((point) => visibility(point)),
  );
  const rightConfidence = average(
    Object.values(right).map((point) => visibility(point)),
  );
  const selected = leftConfidence >= rightConfidence ? left : right;
  const selectedSpatial =
    leftConfidence >= rightConfidence ? spatialLeft : spatialRight;
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

  const kneeAngle = angleAt(
    selectedSpatial.hip,
    selectedSpatial.knee,
    selectedSpatial.ankle,
  );
  const kneeBend = 180 - kneeAngle;
  const hipAngle = angleAt(
    selectedSpatial.shoulder,
    selectedSpatial.hip,
    selectedSpatial.knee,
  );
  const shoulderAngle = angleAt(
    selectedSpatial.elbow,
    selectedSpatial.shoulder,
    selectedSpatial.hip,
  );
  const elbowAngle = angleAt(
    selectedSpatial.shoulder,
    selectedSpatial.elbow,
    selectedSpatial.wrist,
  );
  const elbowBend = 180 - elbowAngle;
  const ankleAngle = angleAt(
    selectedSpatial.knee,
    selectedSpatial.ankle,
    selectedSpatial.foot,
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
  const leftKneeAngle = angleAt(
    spatialLeft.hip,
    spatialLeft.knee,
    spatialLeft.ankle,
  );
  const rightKneeAngle = angleAt(
    spatialRight.hip,
    spatialRight.knee,
    spatialRight.ankle,
  );
  const leftElbowBend =
    180 - angleAt(spatialLeft.shoulder, spatialLeft.elbow, spatialLeft.wrist);
  const rightElbowBend =
    180 -
    angleAt(spatialRight.shoulder, spatialRight.elbow, spatialRight.wrist);
  const leftShoulderAngle = angleAt(
    spatialLeft.elbow,
    spatialLeft.shoulder,
    spatialLeft.hip,
  );
  const rightShoulderAngle = angleAt(
    spatialRight.elbow,
    spatialRight.shoulder,
    spatialRight.hip,
  );
  const leftHipAngle = angleAt(
    spatialLeft.shoulder,
    spatialLeft.hip,
    spatialLeft.knee,
  );
  const rightHipAngle = angleAt(
    spatialRight.shoulder,
    spatialRight.hip,
    spatialRight.knee,
  );
  const bilateralDifference = average([
    Math.abs(leftKneeAngle - rightKneeAngle),
    Math.abs(leftElbowBend - rightElbowBend),
    Math.abs(leftShoulderAngle - rightShoulderAngle),
    Math.abs(leftHipAngle - rightHipAngle),
  ]);
  const symmetryScore = clamp(100 - bilateralDifference * 2.2, 0, 100);

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
    leftKneeAngle,
    rightKneeAngle,
    leftElbowBend,
    rightElbowBend,
    leftShoulderAngle,
    rightShoulderAngle,
    leftHipAngle,
    rightHipAngle,
    symmetryScore,
  };
}

export function metricValue(metrics: PoseMetrics, key: MetricKey) {
  return metrics[key];
}

export function initialRepTracker(): RepTracker {
  return {
    phase: "ready",
    armed: false,
    extremeValue: 0,
    maxCompensation: 0,
    startedAt: 0,
    holdStartedAt: null,
    cooldownUntil: 0,
    pendingTransition: null,
    pendingFrames: 0,
    phaseEnteredAt: 0,
  };
}

function confirmTransition(
  tracker: RepTracker,
  transition: NonNullable<RepTracker["pendingTransition"]>,
) {
  const pendingFrames =
    tracker.pendingTransition === transition ? tracker.pendingFrames + 1 : 1;
  return {
    confirmed: pendingFrames >= REQUIRED_TRANSITION_FRAMES,
    tracker: {
      ...tracker,
      pendingTransition: transition,
      pendingFrames,
    },
  };
}

function clearTransition(tracker: RepTracker) {
  if (!tracker.pendingTransition && tracker.pendingFrames === 0) return tracker;
  return { ...tracker, pendingTransition: null, pendingFrames: 0 };
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

    if (current.holdStartedAt === null) {
      const confirmation = confirmTransition(current, "hold");
      if (!confirmation.confirmed) {
        return {
          tracker: {
            ...confirmation.tracker,
            phase: "holding",
            extremeValue: value,
            maxCompensation: Math.max(
              current.maxCompensation,
              compensation,
            ),
          },
        };
      }
    }

    const holdStartedAt = current.holdStartedAt ?? now;
    const tracker: RepTracker = {
      ...clearTransition(current),
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

  // A rep may only start after the neutral/returned position has been seen.
  // This prevents a bent starting pose or a video beginning mid-rep from
  // producing a false count.
  if (
    profile.mode === "rep" &&
    current.phase === "ready" &&
    !current.armed
  ) {
    if (!hasReturned(value, profile)) {
      return { tracker: clearTransition(current) };
    }
    const confirmation = confirmTransition(current, "return");
    if (!confirmation.confirmed) {
      return { tracker: confirmation.tracker };
    }
    return {
      tracker: {
        ...clearTransition(confirmation.tracker),
        armed: true,
      },
    };
  }

  if (
    current.phase === "ready" &&
    current.armed &&
    hasStarted(value, profile)
  ) {
    const confirmation = confirmTransition(current, "start");
    if (!confirmation.confirmed) {
      return { tracker: confirmation.tracker };
    }
    return {
      tracker: {
        ...clearTransition(current),
        phase: "moving",
        extremeValue: value,
        maxCompensation: compensation,
        startedAt: now,
        phaseEnteredAt: now,
      },
    };
  }

  if (current.phase === "ready") {
    return { tracker: clearTransition(current) };
  }

  const tracker: RepTracker = {
    ...current,
    extremeValue: nextExtreme(current.extremeValue, value, profile),
    maxCompensation: Math.max(current.maxCompensation, compensation),
  };

  if (
    current.phase === "moving" &&
    now - current.phaseEnteredAt >= MIN_MOVEMENT_PHASE_MS &&
    hasReachedTarget(value, profile)
  ) {
    const confirmation = confirmTransition(tracker, "target");
    if (!confirmation.confirmed) {
      return { tracker: confirmation.tracker };
    }
    return {
      tracker: {
        ...clearTransition(confirmation.tracker),
        phase: "target",
        phaseEnteredAt: now,
      },
    };
  }

  if (
    current.phase === "target" &&
    now - current.phaseEnteredAt >= MIN_TARGET_PHASE_MS &&
    now - current.startedAt >= MIN_COMPLETE_REP_MS &&
    hasReturned(value, profile)
  ) {
    const confirmation = confirmTransition(tracker, "return");
    if (!confirmation.confirmed) {
      return { tracker: confirmation.tracker };
    }
    return {
      tracker: {
        ...clearTransition(confirmation.tracker),
        phase: "returning",
        phaseEnteredAt: now,
      },
    };
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

  return { tracker: clearTransition(tracker) };
}
