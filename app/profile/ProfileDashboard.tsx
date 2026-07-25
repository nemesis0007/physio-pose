"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PROFILE_HISTORY_EVENT,
  readExerciseHistory,
  type ExerciseHistoryEntry,
} from "../profile-storage";

export function ProfileDashboard({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);

  useEffect(() => {
    const refresh = () => setHistory(readExerciseHistory(email));
    refresh();
    window.addEventListener(PROFILE_HISTORY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PROFILE_HISTORY_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [email]);

  const totals = useMemo(
    () => ({
      sessions: history.length,
      reps: history.reduce((sum, entry) => sum + entry.totalReps, 0),
      accepted: history.reduce(
        (sum, entry) => sum + entry.acceptedReps,
        0,
      ),
      exercises: new Set(history.map((entry) => entry.exerciseId)).size,
    }),
    [history],
  );

  const grouped = useMemo(
    () =>
      history.reduce<Record<string, ExerciseHistoryEntry[]>>(
        (days, entry) => {
          (days[entry.date] ??= []).push(entry);
          return days;
        },
        {},
      ),
    [history],
  );

  return (
    <>
      <section className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="eyebrow">YOUR PHYSIOTWIN PROFILE</p>
          <h1>{displayName}</h1>
          <p>{email}</p>
        </div>
      </section>

      <section className="profile-stats" aria-label="Exercise totals">
        <article><span>Logged days</span><strong>{totals.sessions}</strong></article>
        <article><span>Total reps</span><strong>{totals.reps}</strong></article>
        <article><span>Accepted</span><strong>{totals.accepted}</strong></article>
        <article><span>Exercises</span><strong>{totals.exercises}</strong></article>
      </section>

      <section className="history-section">
        <div className="history-heading">
          <div>
            <p className="eyebrow">ACTIVITY LOG</p>
            <h2>Exercises by day.</h2>
          </div>
          <Link className="profile-primary-action" href="/">
            Start assessment
          </Link>
        </div>

        {history.length === 0 ? (
          <div className="history-empty">
            <strong>No exercise history yet.</strong>
            <p>Complete a scored repetition and it will appear here automatically.</p>
          </div>
        ) : (
          <div className="history-days">
            {Object.entries(grouped).map(([date, entries]) => (
              <article className="history-day" key={date}>
                <time dateTime={date}>
                  {new Date(`${date}T12:00:00`).toLocaleDateString([], {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
                <div>
                  {entries.map((entry) => (
                    <div className="history-row" key={entry.id}>
                      <div>
                        <strong>{entry.exerciseName}</strong>
                        <span>
                          Last activity{" "}
                          {new Date(entry.lastPerformedAt).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </span>
                      </div>
                      <dl>
                        <div><dt>Reps</dt><dd>{entry.totalReps}</dd></div>
                        <div><dt>Accepted</dt><dd>{entry.acceptedReps}</dd></div>
                        <div><dt>Best</dt><dd>{entry.bestScore}</dd></div>
                      </dl>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
