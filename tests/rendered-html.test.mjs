import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${pathname}`,
  );
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function request(pathname, init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "test",
    `${process.pid}-${Date.now()}-${pathname}-request`,
  );
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the video assessment product", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PhysioTwin/);
  assert.match(html, /Upload exercise video/);
  assert.match(html, /accept="video\/mp4,video\/webm,video\/quicktime,video\/\*"/);
  assert.match(html, /Video never leaves this device/);
  assert.match(html, /Chair sit-to-stand/);
  assert.match(html, /Transparent scoring/);
  assert.match(html, /Anonymous movement measurements are scored by Cloudflare/);
  assert.match(html, /INTERACTIVE 3D MOVEMENT GUIDE/);
  assert.match(html, /Preparing the 3D guide/);
  assert.match(html, /ready before you reach this section/);
  assert.match(html, /Download session report/);
  assert.match(html, /gate ≥/);
});

test("server-renders the searchable exercise library", async () => {
  const response = await render("/exercises");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /26 movement protocols/);
  assert.match(html, /Shoulder wall slide/);
  assert.match(html, /Supported single-leg balance/);
  assert.match(html, /Push-up/);
  assert.match(html, /Pull-up/);
  assert.match(html, /Heuristic scoring/);
  assert.match(html, /All protocols now have explainable demo scoring/);
});

test("server-renders the model card and safety limitations", async () => {
  const response = await render("/how-it-works");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /MediaPipe Pose Landmarker Full/);
  assert.match(html, /three-frame confirmation/);
  assert.match(html, /Finite-state machine/);
  assert.match(html, /26 transparent hackathon rule profiles/);
  assert.match(html, /0–100 heuristic score/);
  assert.match(html, /No LLM/);
  assert.match(html, /Random Forest baseline/);
  assert.match(html, /Download Model Lab notebook/);
  assert.match(html, /physiotwin-model-lab\.ipynb/);
  assert.match(html, /movement intelligence stack/i);
});

test("server-renders the profile login experience", async () => {
  const response = await render("/profile");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Loading profile/);
  assert.match(html, /Profile/);
});

test("server-renders the shared patient and physio care plan", async () => {
  const response = await render("/care-plan");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /YOUR HOME PROGRAMME/);
  assert.match(html, /Your plan, one day at a time/);
  assert.doesNotMatch(html, /Physio workspace/);
  assert.match(html, /profile ID connects completed reps/i);
});

test("calculates anonymized session scores in the Cloudflare route", async () => {
  const response = await request("/api/session-score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      exerciseId: "chair-sit-to-stand",
      reps: [
        {
          accepted: true,
          score: 91,
          symmetry: 92,
          confidence: 0.9,
          cameraQuality: 94,
          issues: [],
        },
        {
          accepted: true,
          score: 86,
          symmetry: 88,
          confidence: 0.87,
          cameraQuality: 91,
          issues: [],
        },
        {
          accepted: false,
          score: 62,
          symmetry: 74,
          confidence: 0.81,
          cameraQuality: 84,
          issues: ["Keep the chest taller."],
        },
      ],
      recentScores: [70, 74, 80],
    }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.summary.processor, "cloudflare-worker");
  assert.equal(payload.summary.totalReps, 3);
  assert.equal(payload.summary.acceptedReps, 2);
  assert.equal(payload.summary.acceptanceRate, 67);
  assert.equal(payload.summary.coachingFocus, "Keep the chest taller.");
});

test("defines a scoring profile for every exercise", async () => {
  const [source, mannequin] = await Promise.all([
    readFile(new URL("../app/exercise-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ExerciseMannequin.tsx", import.meta.url), "utf8"),
  ]);
  const librarySection = source.split("export const EXERCISES")[0];
  const profileSection = source.split(
    "export const SCORING_PROFILES",
  )[1];
  const exerciseIds = [
    ...librarySection.matchAll(/\bid:\s*"([^"]+)"/g),
  ].map((match) => match[1]);

  assert.equal(exerciseIds.length, 26);
  for (const exerciseId of exerciseIds) {
    const escaped = exerciseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      profileSection,
      new RegExp(`(?:["']${escaped}["']|\\b${escaped}\\b)\\s*:`),
      `missing scoring profile for ${exerciseId}`,
    );
    assert.match(
      mannequin,
      new RegExp(`case\\s+["']${escaped}["']\\s*:`),
      `missing 3D animation for ${exerciseId}`,
    );
  }
});
