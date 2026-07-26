"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { currentUsername } from "../auth-storage";
import { EXERCISES } from "../exercise-data";
import type { CareAssignment, CarePlanResponse } from "./types";

const emptyPlan: CarePlanResponse = {
  assignments: [],
  summary: {
    totalReps: 0,
    acceptedReps: 0,
    bestScore: 0,
    completedAssignments: 0,
  },
};

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function displayDate(date: string) {
  const today = localDate();
  if (date === today) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === localDate(tomorrow)) return "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function statusLabel(assignment: CareAssignment) {
  if (assignment.acceptedReps >= assignment.targetReps) return "Completed";
  if (assignment.totalReps > 0) return "In progress";
  if (assignment.assignedDate < localDate()) return "Missed";
  return "Assigned";
}

export function CarePlanPortal() {
  const [mode, setMode] = useState<"patient" | "physio">("patient");
  const [username, setUsername] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [plan, setPlan] = useState<CarePlanResponse>(emptyPlan);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id);
  const [assignedDate, setAssignedDate] = useState(localDate());
  const [targetReps, setTargetReps] = useState(10);
  const [notes, setNotes] = useState("");
  const [therapistName, setTherapistName] = useState("Your physiotherapist");

  const loadPlan = useCallback(async (profileId: string) => {
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(profileId)) {
      setPlan(emptyPlan);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/care-plan?patientId=${encodeURIComponent(profileId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as CarePlanResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Could not load plan.");
      setPlan(payload);
    } catch (problem) {
      setPlan(emptyPlan);
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not load the care plan.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const signedIn = currentUsername();
      setUsername(signedIn);
      if (signedIn) {
        setPatientId(signedIn);
        setTherapistName(`${signedIn} — physiotherapist`);
        void loadPlan(signedIn);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPlan]);

  const todayAssignments = useMemo(
    () =>
      plan.assignments.filter(
        (assignment) => assignment.assignedDate === localDate(),
      ),
    [plan.assignments],
  );
  const upcomingAssignments = useMemo(
    () =>
      plan.assignments.filter(
        (assignment) => assignment.assignedDate > localDate(),
      ),
    [plan.assignments],
  );
  const recentAssignments = useMemo(
    () =>
      plan.assignments.filter(
        (assignment) => assignment.assignedDate < localDate(),
      ),
    [plan.assignments],
  );

  async function assignExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exercise = EXERCISES.find((item) => item.id === exerciseId);
    if (!exercise) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/care-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          patientId,
          therapistName,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          assignedDate,
          targetReps,
          notes,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not assign exercise.");
      }
      setNotes("");
      setSuccess(`${exercise.name} added to ${patientId}'s plan.`);
      await loadPlan(patientId);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not assign exercise.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(assignmentId: number) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/care-plan?patientId=${encodeURIComponent(patientId)}&assignmentId=${assignmentId}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not remove assignment.");
      }
      await loadPlan(patientId);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not remove assignment.",
      );
    } finally {
      setSaving(false);
    }
  }

  function assignmentCard(
    assignment: CareAssignment,
    options?: { removable?: boolean },
  ) {
    const progress = Math.min(
      100,
      Math.round((assignment.acceptedReps / assignment.targetReps) * 100),
    );
    const status = statusLabel(assignment);
    return (
      <article className="care-assignment-card" key={assignment.id}>
        <div className="care-assignment-top">
          <div>
            <span>{displayDate(assignment.assignedDate)}</span>
            <h3>{assignment.exerciseName}</h3>
          </div>
          <strong className={`care-status care-status-${status.toLowerCase().replace(" ", "-")}`}>
            {status}
          </strong>
        </div>
        <p>
          {assignment.notes ||
            "Follow the demonstrated range and stop if you feel pain."}
        </p>
        <div className="care-progress-row">
          <div
            className="care-progress-track"
            aria-label={`${assignment.acceptedReps} of ${assignment.targetReps} accepted repetitions`}
          >
            <i style={{ width: `${progress}%` }} />
          </div>
          <strong>
            {assignment.acceptedReps}/{assignment.targetReps}
          </strong>
        </div>
        <dl>
          <div>
            <dt>Attempts</dt>
            <dd>{assignment.totalReps}</dd>
          </div>
          <div>
            <dt>Best score</dt>
            <dd>{assignment.bestScore || "—"}</dd>
          </div>
          <div>
            <dt>Assigned by</dt>
            <dd>{assignment.therapistName}</dd>
          </div>
        </dl>
        <div className="care-card-actions">
          <Link href={`/?exercise=${assignment.exerciseId}#exercise-demo`}>
            Start exercise
          </Link>
          {options?.removable ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void removeAssignment(assignment.id)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <>
      <section className="care-plan-hero">
        <div>
          <p className="eyebrow">CONNECTED HOME PROGRAMME</p>
          <h1>Your plan, one day at a time.</h1>
          <p>
            Physiotherapists can schedule exercises and review accepted reps,
            while patients always know what to complete next.
          </p>
        </div>
        <div className="care-mode-switch" aria-label="Choose workspace">
          <button
            className={mode === "patient" ? "active" : ""}
            type="button"
            onClick={() => {
              setMode("patient");
              if (username) {
                setPatientId(username);
                void loadPlan(username);
              }
            }}
          >
            My daily plan
          </button>
          <button
            className={mode === "physio" ? "active" : ""}
            type="button"
            onClick={() => setMode("physio")}
          >
            Physio workspace
          </button>
        </div>
      </section>

      {error ? <p className="care-alert care-alert-error">{error}</p> : null}
      {success ? <p className="care-alert care-alert-success">{success}</p> : null}

      {mode === "patient" ? (
        !username ? (
          <section className="care-empty">
            <strong>Sign in to open your assigned programme.</strong>
            <p>Your profile ID connects completed reps to your daily plan.</p>
            <Link href="/profile">Open profile</Link>
          </section>
        ) : (
          <section className="care-patient-workspace">
            <div className="care-summary-grid" aria-label="Plan summary">
              <article>
                <span>Today</span>
                <strong>{todayAssignments.length}</strong>
                <p>assigned exercises</p>
              </article>
              <article>
                <span>Accepted reps</span>
                <strong>{plan.summary.acceptedReps}</strong>
                <p>visible to your physio</p>
              </article>
              <article>
                <span>Completed</span>
                <strong>{plan.summary.completedAssignments}</strong>
                <p>daily assignments</p>
              </article>
              <article>
                <span>Best score</span>
                <strong>{plan.summary.bestScore || "—"}</strong>
                <p>across synced sessions</p>
              </article>
            </div>

            <div className="care-section-heading">
              <div>
                <p className="eyebrow">TODAY</p>
                <h2>Your next exercises.</h2>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadPlan(username)}
              >
                {loading ? "Refreshing…" : "Refresh progress"}
              </button>
            </div>
            {todayAssignments.length ? (
              <div className="care-assignment-grid">
                {todayAssignments.map((assignment) =>
                  assignmentCard(assignment),
                )}
              </div>
            ) : (
              <div className="care-empty">
                <strong>No exercise is assigned for today.</strong>
                <p>Your physiotherapist’s next assignment will appear here.</p>
              </div>
            )}

            {upcomingAssignments.length ? (
              <>
                <div className="care-section-heading care-subheading">
                  <div>
                    <p className="eyebrow">UPCOMING</p>
                    <h2>Plan ahead.</h2>
                  </div>
                </div>
                <div className="care-assignment-grid">
                  {upcomingAssignments.map((assignment) =>
                    assignmentCard(assignment),
                  )}
                </div>
              </>
            ) : null}

            {recentAssignments.length ? (
              <details className="care-previous">
                <summary>Previous assignments</summary>
                <div className="care-assignment-grid">
                  {recentAssignments.map((assignment) =>
                    assignmentCard(assignment),
                  )}
                </div>
              </details>
            ) : null}
          </section>
        )
      ) : (
        <section className="care-physio-workspace">
          <div className="care-physio-toolbar">
            <label>
              Patient profile ID
              <span>
                <input
                  value={patientId}
                  onChange={(event) => setPatientId(event.target.value)}
                  placeholder="patient_username"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadPlan(patientId)}
                >
                  View progress
                </button>
              </span>
            </label>
            <div>
              <span>Connected record</span>
              <strong>{patientId || "No patient selected"}</strong>
              <small>
                Shared measurements only. Raw camera video remains on-device.
              </small>
            </div>
          </div>

          <div className="care-physio-layout">
            <form className="care-assign-form" onSubmit={assignExercise}>
              <p className="eyebrow">NEW ASSIGNMENT</p>
              <h2>Add to the daily plan.</h2>
              <label>
                Your name
                <input
                  value={therapistName}
                  onChange={(event) => setTherapistName(event.target.value)}
                  required
                />
              </label>
              <label>
                Exercise
                <select
                  value={exerciseId}
                  onChange={(event) => setExerciseId(event.target.value)}
                >
                  {EXERCISES.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="care-form-row">
                <label>
                  Date
                  <input
                    type="date"
                    value={assignedDate}
                    onChange={(event) => setAssignedDate(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Target reps
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={targetReps}
                    onChange={(event) =>
                      setTargetReps(Number(event.target.value))
                    }
                    required
                  />
                </label>
              </div>
              <label>
                Patient note
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Example: Keep the chest tall and use the chair for support."
                  rows={4}
                />
              </label>
              <button disabled={saving || !patientId} type="submit">
                {saving ? "Saving…" : "Assign exercise"}
              </button>
            </form>

            <div className="care-patient-review">
              <div className="care-section-heading">
                <div>
                  <p className="eyebrow">PATIENT PROGRESS</p>
                  <h2>{patientId || "Select a patient."}</h2>
                </div>
              </div>
              <div className="care-review-stats">
                <div>
                  <span>Total reps</span>
                  <strong>{plan.summary.totalReps}</strong>
                </div>
                <div>
                  <span>Accepted</span>
                  <strong>{plan.summary.acceptedReps}</strong>
                </div>
                <div>
                  <span>Best</span>
                  <strong>{plan.summary.bestScore || "—"}</strong>
                </div>
              </div>
              {plan.assignments.length ? (
                <div className="care-assignment-grid care-review-list">
                  {plan.assignments.map((assignment) =>
                    assignmentCard(assignment, { removable: true }),
                  )}
                </div>
              ) : (
                <div className="care-empty">
                  <strong>No shared assignments yet.</strong>
                  <p>Add the first exercise using the form.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <p className="care-prototype-note">
        Prototype access uses the patient’s profile ID. A production clinical
        rollout requires verified patient–physio accounts and consent controls.
      </p>
    </>
  );
}
