# PhysioTwin

PhysioTwin is a privacy-first home rehabilitation platform. It uses on-device
pose tracking to guide exercises, count repetitions, explain movement quality,
and connect completed sessions with a shared patient–physiotherapist care plan.

> PhysioTwin is a decision-support prototype, not a medical device. It does not
> diagnose conditions or replace assessment by a qualified clinician. Stop an
> exercise immediately if it causes pain.

## What it includes

- Live camera and local video assessment with MediaPipe Pose Landmarker
- Explainable scoring profiles for 26 rehabilitation exercises
- Automatic repetition tracking, form cues, symmetry signals, and local trends
- Cloudflare Worker session scoring using anonymous movement measurements
- Interactive 3D movement demonstrations backed by a rigged human model
- Printable session reports and a shared patient–physiotherapist care plan

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server. Camera access needs
a secure context, which includes `localhost` during development.

## Quality checks

```bash
npm test
npm run lint
```

`npm test` creates the production build and runs the movement-state,
server-rendering, and Cloudflare scoring-route tests.

## Project map

| Area | Location |
| --- | --- |
| Main assessment experience | `app/PhysioTwinApp.tsx` |
| Movement metrics and rep state machine | `app/movement.ts` |
| Exercise library and scoring profiles | `app/exercise-data.ts` |
| Cloud session scoring | `app/api/session-score/route.ts` |
| Interactive 3D guide | `app/ExerciseMannequin.tsx` |
| Patient and clinician care plan | `app/care-plan/` |
| Shared persistence schema | `db/` and `drizzle/` |
| Tests | `tests/` |

The pose engine is loaded only when a camera or video session begins. Phones
use a lighter camera and inference profile, and the larger 3D guide is deferred
until the user approaches that section.

## Privacy architecture

Camera frames and uploaded videos stay in the browser. After each repetition,
only anonymous measurements—scores, confidence, symmetry, camera quality, and
form flags—are sent to the Cloudflare Worker to calculate the session summary.
Do not commit `.env` files, patient exports, or other health information.

## Deployment

The app uses vinext and Cloudflare-compatible Worker output. Hosting bindings
are declared in `.openai/hosting.json`, while local development bindings live
in `vite.config.ts`.
