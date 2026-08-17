export type CloudRepMeasurement = {
  accepted: boolean;
  score: number;
  symmetry: number;
  confidence: number;
  cameraQuality: number;
  issues: string[];
};

export type CloudSessionScore = {
  processor: "cloudflare-worker";
  totalReps: number;
  acceptedReps: number;
  acceptanceRate: number;
  averageScore: number;
  averageSymmetry: number;
  averageConfidence: number;
  averageCameraQuality: number;
  projectedScore: number;
  trend: number;
  qualityBand: "Strong session" | "Building consistency" | "Review form";
  coachingFocus: string;
  computedAt: string;
};

export type CloudSessionScoreInput = {
  exerciseId: string;
  reps: CloudRepMeasurement[];
  recentScores: number[];
};

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundedMean(values: number[]) {
  return Math.round(mean(values));
}

function projectScores(scores: number[]) {
  if (scores.length < 2) {
    return { trend: 0, projectedScore: Math.round(scores[0] ?? 0) };
  }
  const recent = scores.slice(-6);
  const first = recent[0];
  const last = recent.at(-1) ?? first;
  const trend = (last - first) / Math.max(1, recent.length - 1);
  return {
    trend,
    projectedScore: Math.max(0, Math.min(100, Math.round(last + trend * 3))),
  };
}

export function calculateCloudSessionScore(
  input: CloudSessionScoreInput,
): CloudSessionScore {
  const acceptedReps = input.reps.filter((rep) => rep.accepted).length;
  const acceptanceRate = input.reps.length
    ? Math.round((acceptedReps / input.reps.length) * 100)
    : 0;
  const averageScore = roundedMean(input.reps.map((rep) => rep.score));
  const averageSymmetry = roundedMean(
    input.reps.map((rep) => rep.symmetry),
  );
  const averageConfidence = Number(
    mean(input.reps.map((rep) => rep.confidence)).toFixed(2),
  );
  const averageCameraQuality = roundedMean(
    input.reps.map((rep) => rep.cameraQuality),
  );
  const issueCounts = new Map<string, number>();
  for (const issue of input.reps.flatMap((rep) => rep.issues)) {
    issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
  }
  const coachingFocus =
    [...issueCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "Keep the same controlled pace and range.";
  const qualityBand =
    acceptanceRate >= 85 && averageScore >= 85 && averageSymmetry >= 85
      ? "Strong session"
      : acceptanceRate >= 60 && averageScore >= 65
        ? "Building consistency"
        : "Review form";
  const projection = projectScores(input.recentScores);

  return {
    processor: "cloudflare-worker",
    totalReps: input.reps.length,
    acceptedReps,
    acceptanceRate,
    averageScore,
    averageSymmetry,
    averageConfidence,
    averageCameraQuality,
    projectedScore: projection.projectedScore,
    trend: projection.trend,
    qualityBand,
    coachingFocus,
    computedAt: new Date().toISOString(),
  };
}
