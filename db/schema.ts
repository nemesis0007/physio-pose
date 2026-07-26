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

export const userAccounts = sqliteTable(
  "user_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["patient", "physio"] }).notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull().unique(),
    userId: integer("user_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("auth_sessions_token_idx").on(table.tokenHash)],
);
