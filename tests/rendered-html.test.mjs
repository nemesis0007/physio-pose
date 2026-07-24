import assert from "node:assert/strict";
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

test("server-renders the video assessment product", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PhysioTwin/);
  assert.match(html, /Upload exercise video/);
  assert.match(html, /accept="video\/mp4,video\/webm,video\/quicktime,video\/\*"/);
  assert.match(html, /Videos up to 250 MB/);
  assert.match(html, /Chair sit-to-stand/);
  assert.match(html, /Automated ACCEPT \/ RETRY scoring available/);
});

test("server-renders the searchable exercise library", async () => {
  const response = await render("/exercises");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /24 common rehabilitation movements/);
  assert.match(html, /Shoulder wall slide/);
  assert.match(html, /Supported single-leg balance/);
  assert.match(html, /Automated scoring/);
  assert.match(html, /Pose overlay/);
});

test("server-renders the model card and safety limitations", async () => {
  const response = await render("/how-it-works");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /MediaPipe Pose Landmarker Lite/);
  assert.match(html, /Finite-state machine/);
  assert.match(html, /Therapist-defined thresholds/);
  assert.match(html, /No LLM/);
  assert.match(html, /Prototype limitations/);
});
