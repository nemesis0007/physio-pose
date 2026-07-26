import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { careAssignments, progressEvents } from "../../../db/schema";
import { sessionUser } from "../auth/route";

const patientPattern = /^[a-zA-Z0-9_-]{3,40}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const trustedPortal =
    origin === "http://localhost:3000" ||
    origin === "http://localhost:3001" ||
    /^https:\/\/physiotwin-clinician\.[a-z0-9-]+\.chatgpt\.site$/.test(
      origin,
    ) ||
    /^https:\/\/physiotwin-clinician(?:-[a-z0-9-]+)?\.[a-z0-9-]+\.workers\.dev$/.test(origin);
  return {
    "access-control-allow-origin": trustedPortal ? origin : "null",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    vary: "Origin",
  };
}

function json(
  request: Request,
  data: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  Object.entries(corsHeaders(request)).forEach(([key, value]) =>
    headers.set(key, value),
  );
  return Response.json(data, { ...init, headers });
}

function validPatientId(value: string) {
  return patientPattern.test(value);
}

function safeText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeInteger(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return json(request, { error: "Please sign in." }, { status: 401 });
  const patientId = new URL(request.url).searchParams.get("patientId")?.trim() ?? "";
  if (!validPatientId(patientId)) {
    return json(
      request,
      { error: "Enter a valid patient profile ID." },
      { status: 400 },
    );
  }
  if (user.role === "patient" && user.username !== patientId.toLowerCase()) {
    return json(request, { error: "You can only view your own care plan." }, { status: 403 });
  }

  try {
    const db = await getDb();
    const [assignments, events] = await Promise.all([
      db
        .select()
        .from(careAssignments)
        .where(eq(careAssignments.patientId, patientId))
        .orderBy(asc(careAssignments.assignedDate), desc(careAssignments.id))
        .limit(120),
      db
        .select()
        .from(progressEvents)
        .where(eq(progressEvents.patientId, patientId))
        .orderBy(desc(progressEvents.occurredAt))
        .limit(1000),
    ]);

    const enriched = assignments.map((assignment) => {
      const matching = events.filter(
        (event) =>
          event.exerciseId === assignment.exerciseId &&
          event.activityDate === assignment.assignedDate,
      );
      return {
        ...assignment,
        totalReps: matching.length,
        acceptedReps: matching.filter((event) => event.accepted).length,
        bestScore: matching.reduce(
          (best, event) => Math.max(best, event.score),
          0,
        ),
      };
    });

    const acceptedReps = events.filter((event) => event.accepted).length;
    const exerciseGroups = new Map<string, typeof events>();
    const dayGroups = new Map<string, typeof events>();
    for (const event of events) {
      exerciseGroups.set(event.exerciseId, [
        ...(exerciseGroups.get(event.exerciseId) ?? []),
        event,
      ]);
      dayGroups.set(event.activityDate, [
        ...(dayGroups.get(event.activityDate) ?? []),
        event,
      ]);
    }
    return json(request, {
      assignments: enriched,
      summary: {
        totalReps: events.length,
        acceptedReps,
        bestScore: events.reduce(
          (best, event) => Math.max(best, event.score),
          0,
        ),
        completedAssignments: enriched.filter(
          (assignment) => assignment.acceptedReps >= assignment.targetReps,
        ).length,
      },
      details: {
        exerciseBreakdown: Array.from(exerciseGroups.entries()).map(
          ([exerciseId, matching]) => ({
            exerciseId,
            exerciseName: matching[0]?.exerciseName ?? exerciseId,
            totalReps: matching.length,
            acceptedReps: matching.filter((event) => event.accepted).length,
            bestScore: matching.reduce(
              (best, event) => Math.max(best, event.score),
              0,
            ),
            lastActivity: matching[0]?.occurredAt ?? "",
          }),
        ),
        dailyActivity: Array.from(dayGroups.entries())
          .map(([date, matching]) => ({
            date,
            totalReps: matching.length,
            acceptedReps: matching.filter((event) => event.accepted).length,
            bestScore: matching.reduce(
              (best, event) => Math.max(best, event.score),
              0,
            ),
          }))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 14),
        recentActivity: events.slice(0, 30).map((event) => ({
          id: event.id,
          exerciseName: event.exerciseName,
          accepted: event.accepted,
          score: event.score,
          occurredAt: event.occurredAt,
        })),
      },
    });
  } catch (error) {
    return json(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "The shared care plan is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return json(request, { error: "Please sign in." }, { status: 401 });
  const payload = (await request.json()) as Record<string, unknown>;
  const action = safeText(payload.action, 20);
  const patientId = safeText(payload.patientId, 40);

  if (!validPatientId(patientId)) {
    return json(
      request,
      { error: "Enter a valid patient profile ID." },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();

    if (action === "assign") {
      if (user.role !== "physio") {
        return json(request, { error: "Only a physiotherapist can assign exercises." }, { status: 403 });
      }
      const therapistName = user.displayName;
      const exerciseId = safeText(payload.exerciseId, 80);
      const exerciseName = safeText(payload.exerciseName, 120);
      const assignedDate = safeText(payload.assignedDate, 10);
      const targetReps = safeInteger(payload.targetReps, 1, 100);
      const notes = safeText(payload.notes, 300);

      if (
        !therapistName ||
        !exerciseId ||
        !exerciseName ||
        !datePattern.test(assignedDate) ||
        targetReps === null
      ) {
        return json(
          request,
          { error: "Complete the exercise, date and target fields." },
          { status: 400 },
        );
      }

      const [assignment] = await db
        .insert(careAssignments)
        .values({
          patientId,
          therapistName,
          exerciseId,
          exerciseName,
          assignedDate,
          targetReps,
          notes,
        })
        .returning();
      return json(request, { assignment }, { status: 201 });
    }

    if (action === "progress") {
      if (user.role !== "patient" || user.username !== patientId.toLowerCase()) {
        return json(request, { error: "You can only record your own progress." }, { status: 403 });
      }
      const exerciseId = safeText(payload.exerciseId, 80);
      const exerciseName = safeText(payload.exerciseName, 120);
      const activityDate = safeText(payload.activityDate, 10);
      const score = safeInteger(payload.score, 0, 100);
      const occurredAt = safeText(payload.occurredAt, 40);

      if (
        !exerciseId ||
        !exerciseName ||
        !datePattern.test(activityDate) ||
        score === null ||
        !occurredAt
      ) {
        return json(
          request,
          { error: "The progress event is incomplete." },
          { status: 400 },
        );
      }

      await db.insert(progressEvents).values({
        patientId,
        exerciseId,
        exerciseName,
        activityDate,
        accepted: payload.accepted === true,
        score,
        occurredAt,
      });
      return json(request, { recorded: true }, { status: 201 });
    }

    return json(request, { error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return json(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "The care plan could not be updated.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return json(request, { error: "Please sign in." }, { status: 401 });
  if (user.role !== "physio") {
    return json(request, { error: "Only a physiotherapist can remove assignments." }, { status: 403 });
  }
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId")?.trim() ?? "";
  const assignmentId = Number(url.searchParams.get("assignmentId"));
  if (!validPatientId(patientId) || !Number.isInteger(assignmentId)) {
    return json(request, { error: "Invalid assignment." }, { status: 400 });
  }

  try {
    const db = await getDb();
    await db
      .delete(careAssignments)
      .where(
        and(
          eq(careAssignments.id, assignmentId),
          eq(careAssignments.patientId, patientId),
        ),
      );
    return json(request, { removed: true });
  } catch (error) {
    return json(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "The assignment could not be removed.",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
