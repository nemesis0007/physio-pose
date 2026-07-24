"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  EXERCISES,
  EXERCISE_CATEGORIES,
  type ExerciseCategory,
} from "../exercise-data";

export function ExerciseLibrary() {
  const [category, setCategory] = useState<
    "All" | ExerciseCategory
  >("All");
  const [query, setQuery] = useState("");

  const visibleExercises = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return EXERCISES.filter((exercise) => {
      const categoryMatches =
        category === "All" || exercise.category === category;
      const queryMatches =
        !normalized ||
        [exercise.name, exercise.focus, exercise.equipment]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return categoryMatches && queryMatches;
    });
  }, [category, query]);

  return (
    <>
      <div className="library-tools" aria-label="Exercise filters">
        <label className="search-box">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. knee, bridge, band"
          />
        </label>
        <div className="category-pills">
          {EXERCISE_CATEGORIES.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="exercise-count">
        Showing <strong>{visibleExercises.length}</strong> therapist-ready
        movement templates
      </div>

      <div className="exercise-grid">
        {visibleExercises.map((exercise, index) => (
          <article className="exercise-card" key={exercise.id}>
            <div className="exercise-card-top">
              <span className="exercise-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={
                  exercise.automatedScoring
                    ? "coverage-badge scored"
                    : "coverage-badge"
                }
              >
                {exercise.automatedScoring
                  ? "Heuristic scoring"
                  : "Pose overlay"}
              </span>
            </div>
            <p className="eyebrow">{exercise.category}</p>
            <h2>{exercise.name}</h2>
            <p className="exercise-focus">{exercise.focus}</p>
            <dl>
              <div>
                <dt>Setup</dt>
                <dd>{exercise.equipment}</dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{exercise.position}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{exercise.level}</dd>
              </div>
            </dl>
            <blockquote>“{exercise.cue}”</blockquote>
            <Link
              className="card-action"
              href={`/?exercise=${exercise.id}#exercise-demo`}
            >
              Open video assessor <span>→</span>
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
