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
          Browse 24 common rehabilitation movements across knee, hip,
          shoulder, spine, ankle and balance care. A therapist should select
          the exercise, dose and safe range for each patient.
        </p>
      </section>
      <section className="content-page">
        <div className="safety-callout">
          <strong>Coverage is honest by design.</strong>
          <p>
            Every movement supports private video playback and pose overlay.
            Automated ACCEPT / RETRY scoring is currently calibrated only for
            chair sit-to-stand; the remaining protocols need clinician-defined
            rules and validation before scoring is enabled.
          </p>
        </div>
        <ExerciseLibrary />
      </section>
      <SiteFooter />
    </main>
  );
}
