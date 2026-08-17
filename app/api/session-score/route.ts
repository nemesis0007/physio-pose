import {
  calculateCloudSessionScore,
  type CloudRepMeasurement,
} from "../../session-scoring";

const exercisePattern = /^[a-z0-9-]{3,80}$/;
const MAX_REPS = 100;
const MAX_HISTORY = 20;
const MAX_BODY_BYTES = 48 * 1024;

function safeNumber(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, value));
}

function safeRep(value: unknown): CloudRepMeasurement | null {
  if (!value || typeof value !== "object") return null;
  const rep = value as Record<string, unknown>;
  const score = safeNumber(rep.score, 0, 100);
  const symmetry = safeNumber(rep.symmetry, 0, 100);
  const confidence = safeNumber(rep.confidence, 0, 1);
  const cameraQuality = safeNumber(rep.cameraQuality, 0, 100);
  if (
    score === null ||
    symmetry === null ||
    confidence === null ||
    cameraQuality === null
  ) {
    return null;
  }
  const issues = Array.isArray(rep.issues)
    ? rep.issues
        .filter((issue): issue is string => typeof issue === "string")
        .map((issue) => issue.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return {
    accepted: rep.accepted === true,
    score,
    symmetry,
    confidence,
    cameraQuality,
    issues,
  };
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Session payload is too large." }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Session payload is too large." }, { status: 413 });
    }
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return json({ error: "Send a valid JSON session." }, { status: 400 });
  }

  const exerciseId =
    typeof payload.exerciseId === "string" ? payload.exerciseId.trim() : "";
  const rawReps = Array.isArray(payload.reps) ? payload.reps : [];
  if (
    !exercisePattern.test(exerciseId) ||
    rawReps.length === 0 ||
    rawReps.length > MAX_REPS
  ) {
    return json({ error: "Invalid session." }, { status: 400 });
  }
  const reps = rawReps.map(safeRep);
  if (reps.some((rep) => rep === null)) {
    return json({ error: "Invalid repetition measurements." }, { status: 400 });
  }
  const recentScores = (Array.isArray(payload.recentScores)
    ? payload.recentScores
    : []
  )
    .map((score) => safeNumber(score, 0, 100))
    .filter((score): score is number => score !== null)
    .slice(-MAX_HISTORY);

  const summary = calculateCloudSessionScore({
    exerciseId,
    reps: reps as CloudRepMeasurement[],
    recentScores,
  });
  return json({ summary });
}
