import { ExerciseLibrary } from "./ExerciseLibrary";
import { SiteFooter } from "../SiteFooter";
import { SiteHeader } from "../SiteHeader";

export default function ExercisesPage() {
  return (
    <main className="shell">
      <SiteHeader />
      <section className="page-hero">
        <p className="eyebrow">THERAPIST-READY MOVEMENT LIBRARY</p>
        <h1>
          One clear place for the <em>full programme.</em>
        </h1>
        <p>
          Browse 26 movement protocols across knee, hip, shoulder, strength,
          spine, ankle and balance care. A therapist should select the
          exercise, dose and safe range for each patient.
        </p>
      </section>
      <section className="content-page">
        <div className="safety-callout">
          <strong>All protocols now have explainable demo scoring.</strong>
          <p>
            Every movement supports private video playback, pose overlay and a
            visible rep-range or stability-hold heuristic. These hackathon
            profiles demonstrate the product workflow; a physiotherapist must
            review and validate every threshold before patient use.
          </p>
        </div>
        <ExerciseLibrary />
      </section>
      <SiteFooter />
    </main>
  );
}
