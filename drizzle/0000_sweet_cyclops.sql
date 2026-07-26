CREATE TABLE `care_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` text NOT NULL,
	`therapist_name` text NOT NULL,
	`exercise_id` text NOT NULL,
	`exercise_name` text NOT NULL,
	`assigned_date` text NOT NULL,
	`target_reps` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `care_assignments_patient_date_idx` ON `care_assignments` (`patient_id`,`assigned_date`);--> statement-breakpoint
CREATE TABLE `progress_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`exercise_name` text NOT NULL,
	`activity_date` text NOT NULL,
	`accepted` integer NOT NULL,
	`score` integer NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `progress_events_patient_date_idx` ON `progress_events` (`patient_id`,`activity_date`);