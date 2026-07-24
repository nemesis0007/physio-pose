"use client";

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXERCISES,
  getScoringProfile,
} from "./exercise-data";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import {
  advanceProtocol,
  getPoseMetrics,
  initialRepTracker,
  metricValue,
  type PoseMetrics,
  type RepDecision,
  type RepPhase,
  type RepTracker,
} from "./movement";

const ExerciseMannequin = dynamic(() =>
  import("./ExerciseMannequin").then((module) => module.ExerciseMannequin),
);

type SessionStatus =
  | "idle"
  | "loading"
  | "tracking"
  | "reposition"
  | "complete"
  | "pain"
  | "error";

type SourceMode = "camera" | "video" | null;

type LoggedRep = RepDecision & {
  id: number;
  time: string;
};

const STATUS_COPY: Record<SessionStatus, string> = {
  idle: "Ready for a supervised assessment",
  loading: "Loading the on-device pose model...",
  tracking: "Pose found — movement tracking active",
  reposition: "Reposition so the full body is visible",
  complete: "Video complete — review the measurements below",
  pain: "Session paused — do not continue through pain",
  error: "Video source could not start",
};

const PHASE_COPY: Record<RepPhase, string> = {
  ready: "Move into the start position",
  moving: "Movement detected",
  target: "Target range reached",
  returning: "Return with control",
  holding: "Hold steady",
};

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

function formatMetric(
  value: number | undefined,
  unit: "°" | "%",
) {
  return value === undefined ? "—" : `${Math.round(value)}${unit}`;
}

export function PhysioTwinApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const sourceActiveRef = useRef(false);
  const sourceModeRef = useRef<SourceMode>(null);
  const animationRef = useRef<number | null>(null);
  const predictFrameRef = useRef<() => void>(() => {});
  const lastVideoTimeRef = useRef(-1);
  const lastUiUpdateRef = useRef(0);
  const trackerRef = useRef<RepTracker>(initialRepTracker());
  const drawingRef = useRef<DrawingUtils | null>(null);

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sourceMode, setSourceMode] = useState<SourceMode>(null);
  const [phase, setPhase] = useState<RepPhase>("ready");
  const [metrics, setMetrics] = useState<PoseMetrics | null>(null);
  const [message, setMessage] = useState(
    "Start the camera, choose an exercise video or use the backup demo.",
  );
  const [reps, setReps] = useState<LoggedRep[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState(() => {
    if (typeof window === "undefined") return "chair-sit-to-stand";
    const query = new URLSearchParams(window.location.search).get("exercise");
    return query && EXERCISES.some((exercise) => exercise.id === query)
      ? query
      : "chair-sit-to-stand";
  });

  const selectedExercise =
    EXERCISES.find((exercise) => exercise.id === selectedExerciseId) ??
    EXERCISES[0];
  const scoringProfile = getScoringProfile(selectedExercise.id);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }, []);

  const logDecision = useCallback(
    (decision: RepDecision) => {
      setReps((current) => [
        {
          ...decision,
          id: current.length + 1,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        },
        ...current,
      ]);
      setMessage(
        decision.accepted
          ? `Accepted — heuristic quality score ${decision.score}/100.`
          : decision.cue,
      );
      speak(decision.cue);
    },
    [speak],
  );

  const stopSource = useCallback(() => {
    sourceActiveRef.current = false;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = null;
    lastVideoTimeRef.current = -1;
    sourceModeRef.current = null;
    setSourceMode(null);
  }, []);

  const analyzeLandmarks = useCallback(
    (landmarks: NormalizedLandmark[]) => {
      const nextMetrics = getPoseMetrics(landmarks);
      if (!nextMetrics) return;

      if (performance.now() - lastUiUpdateRef.current > 90) {
        setMetrics(nextMetrics);
        lastUiUpdateRef.current = performance.now();
      }

      if (nextMetrics.confidence < 0.55) {
        setStatus("reposition");
        return;
      }

      setStatus("tracking");
      const advanced = advanceProtocol(
        trackerRef.current,
        nextMetrics,
        scoringProfile,
        performance.now(),
      );
      trackerRef.current = advanced.tracker;
      setPhase(advanced.tracker.phase);
      if (advanced.decision) logDecision(advanced.decision);
    },
    [logDecision, scoringProfile],
  );

  const predictFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || !sourceActiveRef.current) return;

    if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.landmarks[0];
      const context = canvas.getContext("2d");

      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!drawingRef.current) drawingRef.current = new DrawingUtils(context);
        if (landmarks) {
          context.save();
          if (sourceModeRef.current === "camera") {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
          }
          drawingRef.current.drawConnectors(
            landmarks,
            PoseLandmarker.POSE_CONNECTIONS,
            {
              color: "#68e3d2",
              lineWidth: 4,
            },
          );
          drawingRef.current.drawLandmarks(landmarks, {
            color: "#f7c873",
            fillColor: "#0b1821",
            lineWidth: 2,
            radius: 3,
          });
          context.restore();
          analyzeLandmarks(landmarks);
        } else {
          setStatus("reposition");
        }
      }
    }

    if (sourceActiveRef.current) {
      animationRef.current = requestAnimationFrame(() =>
        predictFrameRef.current(),
      );
    }
  }, [analyzeLandmarks]);

  useEffect(() => {
    predictFrameRef.current = predictFrame;
  }, [predictFrame]);

  const createLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const options = {
      baseOptions: {
        modelAssetPath: "/models/pose_landmarker_lite.task",
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };

    try {
      landmarkerRef.current = await PoseLandmarker.createFromOptions(
        vision,
        options,
      );
    } catch {
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" },
      });
    }
    return landmarkerRef.current;
  }, []);

  const prepareSession = useCallback(() => {
    trackerRef.current = initialRepTracker();
    setPhase("ready");
    setMetrics(null);
    setReps([]);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopSource();
      prepareSession();
      setStatus("loading");
      setMessage(
        "The camera stays in this browser; only movement measurements are evaluated.",
      );
      await createLandmarker();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      video.srcObject = stream;
      await video.play();
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      sourceModeRef.current = "camera";
      setSourceMode("camera");
      sourceActiveRef.current = true;
      setStatus("tracking");
      animationRef.current = requestAnimationFrame(predictFrame);
    } catch (error) {
      console.error(error);
      stopSource();
      setStatus("error");
      setMessage(
        "Camera mode is unavailable. You can upload a video or use the backup demo.",
      );
    }
  }, [createLandmarker, predictFrame, prepareSession, stopSource]);

  const processVideo = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        setStatus("error");
        setMessage("Please choose a video file.");
        return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setStatus("error");
        setMessage("Please choose a video smaller than 250 MB.");
        return;
      }

      try {
        stopSource();
        prepareSession();
        setStatus("loading");
        setMessage(
          `Preparing ${file.name}. The file stays on this device and is not uploaded.`,
        );
        await createLandmarker();

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const objectUrl = URL.createObjectURL(file);
        objectUrlRef.current = objectUrl;
        video.src = objectUrl;
        video.muted = true;
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("The video could not be read."));
        });
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        sourceModeRef.current = "video";
        setSourceMode("video");
        sourceActiveRef.current = true;
        await video.play();
        setStatus("tracking");
        animationRef.current = requestAnimationFrame(predictFrame);
      } catch (error) {
        console.error(error);
        stopSource();
        setStatus("error");
        setMessage(
          "This video could not be processed. Try an MP4, WebM or MOV file.",
        );
      }
    },
    [createLandmarker, predictFrame, prepareSession, stopSource],
  );

  const handleUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void processVideo(file);
      event.target.value = "";
    },
    [processVideo],
  );

  const handleVideoEnded = useCallback(() => {
    sourceActiveRef.current = false;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = null;
    setStatus("complete");
    setMessage(
      "Video complete. Review the heuristic scores and traceable reasons below.",
    );
  }, []);

  const painStop = useCallback(() => {
    stopSource();
    setStatus("pain");
    setMessage(
      "Session stopped. This prototype does not diagnose pain; contact the supervising therapist.",
    );
    speak("Session stopped. Please contact your therapist.");
  }, [speak, stopSource]);

  const simulateRep = useCallback(
    (accepted: boolean) => {
      const primaryValue = accepted
        ? (scoringProfile.targetMin + scoringProfile.targetMax) / 2
        : scoringProfile.direction === "increase"
          ? Math.max(0, scoringProfile.targetMin - 20)
          : scoringProfile.targetMax + 20;
      const compensationValue = accepted
        ? scoringProfile.compensationMax * 0.45
        : scoringProfile.compensationMax + 8;
      const decision: RepDecision = {
        accepted,
        score: accepted ? 92 : 58,
        primaryLabel: scoringProfile.primaryLabel,
        primaryValue,
        primaryUnit: scoringProfile.unit,
        compensationLabel: scoringProfile.compensationLabel,
        compensationValue,
        compensationUnit: scoringProfile.compensationUnit,
        targetText: scoringProfile.targetText,
        reason: accepted
          ? `${scoringProfile.primaryLabel} reached the demo target with controlled compensation.`
          : `${scoringProfile.primaryLabel} or compensation was outside the demo target.`,
        cue: accepted ? "Good repetition." : scoringProfile.rangeCue,
      };
      logDecision(decision);
    },
    [logDecision, scoringProfile],
  );

  useEffect(() => {
    return () => {
      stopSource();
      landmarkerRef.current?.close();
    };
  }, [stopSource]);

  const acceptedCount = reps.filter((rep) => rep.accepted).length;
  const qualityRate = reps.length
    ? Math.round((acceptedCount / reps.length) * 100)
    : 0;
  const sourceActive =
    status === "tracking" ||
    status === "reposition" ||
    status === "loading" ||
    status === "complete";

  return (
    <main className="shell">
      <SiteHeader />

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">PRIVATE VIDEO MOVEMENT ASSESSMENT</p>
          <h1>
            Measure the movement,
            <br />
            <em>not only the angle.</em>
          </h1>
          <p className="hero-intro">
            Use a live camera or an existing exercise video. Pose tracking runs
            in the browser, with transparent protocol rules and the therapist
            still in control.
          </p>

          <label className="exercise-select">
            <span>Exercise protocol</span>
            <select
              value={selectedExerciseId}
              onChange={(event) => {
                stopSource();
                prepareSession();
                setStatus("idle");
                setSelectedExerciseId(event.target.value);
                setMessage(
                  "Hackathon heuristic scoring is available. Use the required camera view and review results with a physiotherapist.",
                );
              }}
            >
              {EXERCISES.map((exercise) => (
                <option value={exercise.id} key={exercise.id}>
                  {exercise.category} — {exercise.name}
                </option>
              ))}
            </select>
            <small>Explainable heuristic scoring available for every protocol</small>
          </label>

          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={startCamera}
              disabled={status === "loading"}
            >
              <span className="button-icon">●</span>
              Start live camera
            </button>
            <button
              className="upload-button"
              onClick={() => uploadRef.current?.click()}
              disabled={status === "loading"}
            >
              Upload exercise video
            </button>
            <input
              ref={uploadRef}
              className="visually-hidden"
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              onChange={handleUpload}
            />
            <button className="stop-button" onClick={painStop}>
              Stop / I feel pain
            </button>
          </div>
          <p className="microcopy">
            Videos up to 250 MB are read from your device and are never sent to
            our server. Use the recommended camera view shown in the exercise
            library.
          </p>
        </div>

        <div className="live-card" aria-label="Live movement assessment">
          <div className="live-header">
            <div>
              <span className={`status-light ${status}`} />
              <strong>{STATUS_COPY[status]}</strong>
            </div>
            <span className="session-id">
              {sourceMode === "video" ? "LOCAL VIDEO" : "SESSION 001"}
            </span>
          </div>
          <div className="camera-stage">
            <video
              ref={videoRef}
              playsInline
              muted
              controls={sourceMode === "video"}
              onEnded={handleVideoEnded}
              className={sourceMode === "camera" ? "mirrored" : ""}
              aria-label={
                sourceMode === "video"
                  ? "Uploaded exercise video"
                  : "Live camera preview"
              }
            />
            <canvas ref={canvasRef} aria-label="Pose landmark overlay" />
            {!sourceActive && (
              <div className="camera-placeholder">
                <div className="pose-figure" aria-hidden="true">
                  <span className="pose-head" />
                  <span className="pose-body" />
                  <span className="pose-arm left" />
                  <span className="pose-arm right" />
                  <span className="pose-leg left" />
                  <span className="pose-leg right" />
                </div>
                <strong>Camera or video preview</strong>
                <span>Processed locally in this browser</span>
              </div>
            )}
            <div className="camera-badge">
              {sourceActive ? PHASE_COPY[phase] : "Awaiting session"}
            </div>
          </div>
          <div className="metric-strip">
            <div>
              <span>{scoringProfile.primaryLabel}</span>
              <strong>
                {formatMetric(
                  metrics
                    ? metricValue(metrics, scoringProfile.metric)
                    : undefined,
                  scoringProfile.unit,
                )}
              </strong>
              <small>target {scoringProfile.targetText}</small>
            </div>
            <div
              className={
                metrics &&
                metricValue(
                  metrics,
                  scoringProfile.compensationMetric,
                ) > scoringProfile.compensationMax
                  ? "metric-alert"
                  : ""
              }
            >
              <span>{scoringProfile.compensationLabel}</span>
              <strong>
                {formatMetric(
                  metrics
                    ? metricValue(
                        metrics,
                        scoringProfile.compensationMetric,
                      )
                    : undefined,
                  scoringProfile.compensationUnit,
                )}
              </strong>
              <small>
                limit ≤{scoringProfile.compensationMax}
                {scoringProfile.compensationUnit}
              </small>
            </div>
            <div>
              <span>Confidence</span>
              <strong>
                {metrics ? metrics.confidence.toFixed(2) : "—"}
              </strong>
              <small>gate ≥0.55</small>
            </div>
          </div>
          <div className="coach-message" aria-live="polite">
            <span>COACH</span>
            <p>{message}</p>
          </div>
        </div>
      </section>

      <section className="protocol-strip" aria-label="Selected protocol">
        <div>
          <span>Selected movement</span>
          <strong>{selectedExercise.name}</strong>
        </div>
        <div>
          <span>Clinical focus</span>
          <strong>{selectedExercise.focus}</strong>
        </div>
        <div>
          <span>Camera setup</span>
          <strong>{selectedExercise.position}</strong>
        </div>
        <div>
          <span>Coverage</span>
          <strong>
            {scoringProfile.mode === "hold"
              ? `${scoringProfile.holdSeconds}s stability hold`
              : "Rep-based heuristic"}
          </strong>
        </div>
      </section>

      <ExerciseMannequin exercise={selectedExercise} />

      <section className="demo-band" aria-labelledby="demo-title">
        <div>
          <p className="eyebrow" id="demo-title">
            BACKUP DEMO CONTROLS
          </p>
          <h2>
            Show the complete decision story even if camera permissions fail.
          </h2>
        </div>
        <div className="demo-actions">
          <button onClick={() => simulateRep(false)}>
            Simulate retry <span>outside protocol target</span>
          </button>
          <button onClick={() => simulateRep(true)}>
            Simulate accepted <span>inside protocol target</span>
          </button>
        </div>
      </section>

      <section className="dashboard" aria-labelledby="summary-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THERAPIST VIEW</p>
            <h2 id="summary-title">Exceptions, not hours of video.</h2>
          </div>
          <p>
            Raw frames stay on the device. This prototype records only the
            measurements and decisions shown in this browser session.
          </p>
        </div>
        <div className="summary-grid">
          <article>
            <span>Accepted attempts</span>
            <strong>
              {acceptedCount}
              <small> / {reps.length}</small>
            </strong>
            <p>Inside the selected heuristic profile</p>
          </article>
          <article>
            <span>Acceptance rate</span>
            <strong>
              {qualityRate}
              <small>%</small>
            </strong>
            <p>{selectedExercise.name} session result</p>
          </article>
          <article>
            <span>Review flags</span>
            <strong>{reps.length - acceptedCount}</strong>
            <p>Repetitions requiring therapist review or retry</p>
          </article>
        </div>
        <div className="event-panel">
          <div className="event-head">
            <span>REP</span>
            <span>DECISION</span>
            <span>MEASUREMENTS</span>
            <span>REASON</span>
            <span>TIME</span>
          </div>
          {reps.length === 0 ? (
            <div className="empty-events">
              Complete the selected movement or use the backup demo controls.
            </div>
          ) : (
            reps.slice(0, 5).map((rep) => (
              <div className="event-row" key={`${rep.id}-${rep.time}`}>
                <strong>#{String(rep.id).padStart(2, "0")}</strong>
                <span
                  className={
                    rep.accepted ? "decision-pass" : "decision-retry"
                  }
                >
                  {rep.accepted ? "ACCEPT" : "RETRY"}
                </span>
                <span>
                  Score {rep.score}/100 · {rep.primaryLabel}{" "}
                  {Math.round(rep.primaryValue)}
                  {rep.primaryUnit}
                </span>
                <span>{rep.reason}</span>
                <span>{rep.time}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
