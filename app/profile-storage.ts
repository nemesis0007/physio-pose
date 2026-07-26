export type ExerciseHistoryEntry = {
  id: string;
  date: string;
  lastPerformedAt: string;
  exerciseId: string;
  exerciseName: string;
  totalReps: number;
  acceptedReps: number;
  bestScore: number;
};

export const PROFILE_HISTORY_EVENT = "physiotwin-history-updated";

export function profileHistoryKey(profileId: string) {
  return `physiotwin-history:${profileId.trim().toLowerCase()}`;
}

export function readExerciseHistory(profileId: string) {
  try {
    const stored = window.localStorage.getItem(profileHistoryKey(profileId));
    if (!stored) return [] as ExerciseHistoryEntry[];
    return (JSON.parse(stored) as ExerciseHistoryEntry[]).sort(
      (a, b) =>
        new Date(b.lastPerformedAt).getTime() -
        new Date(a.lastPerformedAt).getTime(),
    );
  } catch {
    return [] as ExerciseHistoryEntry[];
  }
}

export function recordExerciseActivity(
  profileId: string,
  activity: {
    exerciseId: string;
    exerciseName: string;
    accepted: boolean;
    score: number;
  },
) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const history = readExerciseHistory(profileId);
  const existingIndex = history.findIndex(
    (entry) =>
      entry.date === date && entry.exerciseId === activity.exerciseId,
  );

  if (existingIndex >= 0) {
    const existing = history[existingIndex];
    history[existingIndex] = {
      ...existing,
      lastPerformedAt: now.toISOString(),
      totalReps: existing.totalReps + 1,
      acceptedReps: existing.acceptedReps + Number(activity.accepted),
      bestScore: Math.max(existing.bestScore, activity.score),
    };
  } else {
    history.push({
      id: `${date}:${activity.exerciseId}`,
      date,
      lastPerformedAt: now.toISOString(),
      exerciseId: activity.exerciseId,
      exerciseName: activity.exerciseName,
      totalReps: 1,
      acceptedReps: Number(activity.accepted),
      bestScore: activity.score,
    });
  }

  const next = history
    .sort(
      (a, b) =>
        new Date(b.lastPerformedAt).getTime() -
        new Date(a.lastPerformedAt).getTime(),
    )
    .slice(0, 180);
  window.localStorage.setItem(
    profileHistoryKey(profileId),
    JSON.stringify(next),
  );
  window.dispatchEvent(new Event(PROFILE_HISTORY_EVENT));

  void fetch("/api/care-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "progress",
      patientId: profileId,
      exerciseId: activity.exerciseId,
      exerciseName: activity.exerciseName,
      activityDate: date,
      accepted: activity.accepted,
      score: activity.score,
      occurredAt: now.toISOString(),
    }),
  }).catch(() => {
    // The local session remains usable if shared progress is unavailable.
  });
}
