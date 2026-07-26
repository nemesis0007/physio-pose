import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const careAssignments = sqliteTable(
  "care_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: text("patient_id").notNull(),
    therapistName: text("therapist_name").notNull(),
    exerciseId: text("exercise_id").notNull(),
    exerciseName: text("exercise_name").notNull(),
    assignedDate: text("assigned_date").notNull(),
    targetReps: integer("target_reps").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("care_assignments_patient_date_idx").on(
      table.patientId,
      table.assignedDate,
    ),
  ],
);

export const progressEvents = sqliteTable(
  "progress_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: text("patient_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    exerciseName: text("exercise_name").notNull(),
    activityDate: text("activity_date").notNull(),
    accepted: integer("accepted", { mode: "boolean" }).notNull(),
    score: integer("score").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("progress_events_patient_date_idx").on(
      table.patientId,
      table.activityDate,
    ),
  ],
);
