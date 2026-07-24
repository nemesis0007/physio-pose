import { SiteFooter } from "../SiteFooter";
import { SiteHeader } from "../SiteHeader";

const PROCESS = [
  {
    step: "01",
    title: "Capture",
    body: "Use a live camera or choose an exercise video. The browser reads frames locally; this version does not send or store the video.",
  },
  {
    step: "02",
    title: "Estimate pose",
    body: "MediaPipe Pose Landmarker Full locates 33 body landmarks. WebGL/GPU is attempted first with a CPU fallback.",
  },
  {
    step: "03",
    title: "Measure",
    body: "Full-body framing gates and temporal smoothing stabilize the landmarks before geometry converts them into joint and compensation measures.",
  },
  {
    step: "04",
    title: "Segment the rep",
    body: "A finite-state machine detects ready, descending, bottom and ascending phases so a complete repetition is judged once.",
  },
  {
    step: "05",
    title: "Apply protocol rules",
    body: "The selected exercise profile checks its primary range plus a visible compensation measure. These hackathon thresholds are transparent and designed to be replaced by clinician-approved values.",
  },
  {
    step: "06",
    title: "Coach and review",
    body: "The patient gets a short browser-generated voice cue, while the therapist sees accepted reps, retries and the reason for each flag.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="shell">
      <SiteHeader />
      <section className="page-hero">
        <p className="eyebrow">MODEL CARD · SYSTEM PROCESS</p>
        <h1>
          Explainable enough for a <em>therapist to challenge.</em>
        </h1>
        <p>
          PhysioTwin combines a pretrained pose model with transparent
          biomechanics and clinician-owned rules. It does not use a black-box
          model to prescribe treatment.
        </p>
      </section>

      <section className="content-page">
        <div className="process-grid">
          {PROCESS.map((item) => (
            <article key={item.step}>
              <span>{item.step}</span>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <section className="model-section" aria-labelledby="models-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">WHAT MODELS ARE USED?</p>
              <h2 id="models-title">The complete technical truth.</h2>
            </div>
            <p>
              The hackathon MVP trains no new neural network. It reuses a
              compact pretrained pose estimator and keeps the clinical
              decision logic readable.
            </p>
          </div>
          <div className="model-table">
            <div className="model-row model-head">
              <span>Component</span>
              <span>Technology</span>
              <span>Trained by us?</span>
              <span>Job</span>
            </div>
            <div className="model-row">
              <strong>Pose estimation</strong>
              <span>MediaPipe Pose Landmarker Full, float16 task model</span>
              <span>No — pretrained</span>
              <span>Returns 33 body landmarks from each video frame</span>
            </div>
            <div className="model-row">
              <strong>Movement metrics</strong>
              <span>Frame validation, temporal smoothing and vector geometry</span>
              <span>No ML</span>
              <span>Rejects unstable frames and computes joint measures</span>
            </div>
            <div className="model-row">
              <strong>Rep detection</strong>
              <span>Finite-state machine with three-frame confirmation</span>
              <span>No ML</span>
              <span>Segments repetitions or timed stability holds</span>
            </div>
            <div className="model-row">
              <strong>Quality decision</strong>
              <span>24 transparent hackathon rule profiles</span>
              <span>No ML</span>
              <span>Produces a 0–100 heuristic score and traceable reason</span>
            </div>
            <div className="model-row">
              <strong>Voice cue</strong>
              <span>Browser Speech Synthesis</span>
              <span>No LLM</span>
              <span>Reads the deterministic feedback aloud</span>
            </div>
          </div>
        </section>

        <section className="roadmap-section" id="coverage">
          <div>
            <p className="eyebrow">WHAT TO TRAIN NEXT</p>
            <h2>Only after collecting clinician-labelled movement data.</h2>
          </div>
          <ol>
            <li>
              <strong>Start with XGBoost.</strong> Train on engineered
              landmark features as an interpretable baseline for each exercise.
            </li>
            <li>
              <strong>Compare a temporal model.</strong> A TCN or ST-GCN can
              learn motion over time once the dataset is large and diverse
              enough.
            </li>
            <li>
              <strong>Keep safety outside the model.</strong> Pain stop,
              confidence gates and hard contraindications remain deterministic.
            </li>
            <li>
              <strong>Validate prospectively.</strong> Test across devices,
              clothing, body types, mobility aids and real home environments
              with physiotherapist review.
            </li>
          </ol>
        </section>

        <div className="limitations">
          <strong>Prototype limitations</strong>
          <p>
            A single RGB camera cannot measure pain, force, swelling, internal
            joint loading or clinical recovery. Landmark accuracy can drop with
            occlusion, unusual camera angles, loose clothing and low light.
            PhysioTwin is a supervised hackathon prototype, not a medical
            device or emergency service.
          </p>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
