"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { currentUsername } from "../auth-storage";
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
  const [username, setUsername] = useState<string | null>(null);
  const [plan, setPlan] = useState<CarePlanResponse>(emptyPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      if (signedIn) void loadPlan(signedIn);
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

  function assignmentCard(assignment: CareAssignment) {
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
          <strong
            className={`care-status care-status-${status.toLowerCase().replace(" ", "-")}`}
          >
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
        </div>
      </article>
    );
  }

  return (
    <>
      <section className="care-plan-hero">
        <div>
          <p className="eyebrow">YOUR HOME PROGRAMME</p>
          <h1>Your plan, one day at a time.</h1>
          <p>
            See what your physiotherapist assigned, complete each exercise with
            live movement feedback, and keep your progress up to date.
          </p>
        </div>
        {username ? (
          <div className="patient-plan-identity">
            <span>Patient profile</span>
            <strong>{username}</strong>
          </div>
        ) : null}
      </section>

      {error ? <p className="care-alert care-alert-error">{error}</p> : null}

      {!username ? (
        <section className="care-empty patient-plan-empty">
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
              <p>shared with your physio</p>
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
              {todayAssignments.map(assignmentCard)}
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
                {upcomingAssignments.map(assignmentCard)}
              </div>
            </>
          ) : null}

          {recentAssignments.length ? (
            <details className="care-previous">
              <summary>Previous assignments</summary>
              <div className="care-assignment-grid">
                {recentAssignments.map(assignmentCard)}
              </div>
            </details>
          ) : null}
        </section>
      )}

      <p className="care-prototype-note">
        Your assessment video stays on this device. Only rep measurements,
        scores and care-plan progress are shared.
      </p>
    </>
  );
}
