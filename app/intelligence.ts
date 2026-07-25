import type { PoseMetrics } from "./movement";

export type CalibrationProfile = {
  completed: boolean;
  confidenceBaseline: number;
  symmetryBaseline: number;
  trunkBaseline: number;
};

export type MovementInsight = {
  cameraQuality: number;
  symmetry: number;
  detectedExercise: string;
  detectionConfidence: number;
  issues: string[];
  readiness: "excellent" | "good" | "reposition";
};

export type ProgressSession = {
  date: string;
  exerciseId: string;
  score: number;
  symmetry: number;
  confidence: number;
};

const label = (id: string) =>
  id
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");

const range = (frames: PoseMetrics[], key: keyof PoseMetrics) => {
  const values = frames
    .map((frame) => frame[key])
    .filter((value): value is number => typeof value === "number");
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
};

export function buildCalibration(
  frames: PoseMetrics[],
): CalibrationProfile | null {
  if (frames.length < 18) return null;
  const average = (key: keyof PoseMetrics) =>
    frames.reduce((sum, frame) => sum + Number(frame[key]), 0) / frames.length;
  return {
    completed: true,
    confidenceBaseline: average("confidence"),
    symmetryBaseline: average("symmetryScore"),
    trunkBaseline: average("trunkLean"),
  };
}

export function recognizeMovement(frames: PoseMetrics[]) {
  if (frames.length < 12) {
    return { id: "collecting", confidence: 0 };
  }

  const elbowTravel = range(frames, "elbowBend");
  const kneeTravel = range(frames, "kneeAngle");
  const hipTravel = range(frames, "hipAngle");
  const shoulderTravel = range(frames, "shoulderAngle");
  const footTravel = range(frames, "singleLegLift");
  const avg = (key: keyof PoseMetrics) =>
    frames.reduce((sum, frame) => sum + Number(frame[key]), 0) / frames.length;

  const candidates = [
    {
      id: "push-up",
      score:
        elbowTravel * 1.25 +
        Math.max(0, 75 - avg("hipAngle")) +
        Math.max(0, 30 - avg("trunkLean")),
    },
    {
      id: "pull-up",
      score:
        elbowTravel * 1.1 +
        Math.max(0, avg("shoulderAngle") - 75) +
        Math.max(0, 40 - footTravel),
    },
    {
      id: "mini-squat",
      score:
        kneeTravel * 1.35 +
        hipTravel * 0.55 +
        Math.max(0, 30 - shoulderTravel),
    },
    {
      id: "shoulder-abduction",
      score: shoulderTravel * 1.45 + Math.max(0, 35 - kneeTravel),
    },
    {
      id: "single-leg-balance",
      score: footTravel * 1.2 + Math.max(0, 25 - kneeTravel),
    },
  ].sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const margin = Math.max(0, best.score - candidates[1].score);
  return {
    id: best.score < 28 ? "unknown" : best.id,
    confidence: Math.min(0.97, 0.52 + margin / 130),
  };
}

export function assessMovement(
  frames: PoseMetrics[],
  selectedExerciseId: string,
  calibration: CalibrationProfile | null,
): MovementInsight {
  const current = frames.at(-1);
  if (!current) {
    return {
      cameraQuality: 0,
      symmetry: 0,
      detectedExercise: "Waiting for movement",
      detectionConfidence: 0,
      issues: [],
      readiness: "reposition",
    };
  }

  const recognition = recognizeMovement(frames);
  const confidenceFloor = calibration?.confidenceBaseline ?? 0.78;
  const cameraQuality = Math.round(
    Math.min(100, (current.confidence / Math.max(0.7, confidenceFloor)) * 92),
  );
  const symmetry = Math.round(
    calibration
      ? Math.min(
          100,
          current.symmetryScore +
            (92 - calibration.symmetryBaseline) * 0.25,
        )
      : current.symmetryScore,
  );
  const issues: string[] = [];

  if (selectedExerciseId === "push-up") {
    if (current.hipAngle < 150) issues.push("Hip line is dropping");
    if (current.elbowBend < 65) issues.push("Depth is incomplete");
    if (current.pelvisTilt > 18) issues.push("Pelvis is rotating");
  } else if (selectedExerciseId === "pull-up") {
    if (current.elbowBend < 70) issues.push("Pull range is incomplete");
    if (current.kneeBend > 35) issues.push("Lower-body momentum detected");
    if (current.pelvisTilt > 18) issues.push("Body is swinging");
  } else {
    if (current.trunkLean > 22) issues.push("Excess trunk compensation");
    if (symmetry < 78) issues.push("Left-right difference detected");
  }
  if (cameraQuality < 70) issues.push("Camera confidence is low");

  return {
    cameraQuality,
    symmetry,
    detectedExercise:
      recognition.id === "collecting"
        ? "Learning movement…"
        : recognition.id === "unknown"
          ? "Unknown movement"
          : label(recognition.id),
    detectionConfidence: recognition.confidence,
    issues: [...new Set(issues)].slice(0, 3),
    readiness:
      cameraQuality >= 86
        ? "excellent"
        : cameraQuality >= 70
          ? "good"
          : "reposition",
  };
}

export function projectProgress(sessions: ProgressSession[]) {
  if (sessions.length < 2) return { trend: 0, projected: sessions[0]?.score ?? 0 };
  const recent = sessions.slice(-6);
  const first = recent[0].score;
  const last = recent.at(-1)?.score ?? first;
  const trend = (last - first) / Math.max(1, recent.length - 1);
  return {
    trend,
    projected: Math.max(0, Math.min(100, Math.round(last + trend * 3))),
  };
}
