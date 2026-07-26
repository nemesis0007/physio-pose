import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { careAssignments, progressEvents } from "../../../db/schema";

const patientPattern = /^[a-zA-Z0-9_-]{3,40}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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
  const patientId = new URL(request.url).searchParams.get("patientId")?.trim() ?? "";
  if (!validPatientId(patientId)) {
    return Response.json(
      { error: "Enter a valid patient profile ID." },
      { status: 400 },
    );
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
    return Response.json({
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
    });
  } catch (error) {
    return Response.json(
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
  const payload = (await request.json()) as Record<string, unknown>;
  const action = safeText(payload.action, 20);
  const patientId = safeText(payload.patientId, 40);

  if (!validPatientId(patientId)) {
    return Response.json(
      { error: "Enter a valid patient profile ID." },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();

    if (action === "assign") {
      const therapistName = safeText(payload.therapistName, 80);
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
        return Response.json(
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
      return Response.json({ assignment }, { status: 201 });
    }

    if (action === "progress") {
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
        return Response.json(
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
      return Response.json({ recorded: true }, { status: 201 });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json(
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
  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId")?.trim() ?? "";
  const assignmentId = Number(url.searchParams.get("assignmentId"));
  if (!validPatientId(patientId) || !Number.isInteger(assignmentId)) {
    return Response.json({ error: "Invalid assignment." }, { status: 400 });
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
    return Response.json({ removed: true });
  } catch (error) {
    return Response.json(
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
