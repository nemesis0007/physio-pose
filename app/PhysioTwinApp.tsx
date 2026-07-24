"use client";

import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceRep,
  getPoseMetrics,
  initialRepTracker,
  type PoseMetrics,
  type RepDecision,
  type RepPhase,
  type RepTracker,
} from "./movement";

type SessionStatus =
  | "idle"
  | "loading"
  | "tracking"
  | "reposition"
  | "pain"
  | "error";

type LoggedRep = RepDecision & {
  id: number;
  time: string;
};

const STATUS_COPY: Record<SessionStatus, string> = {
  idle: "Ready for a supervised demo",
  loading: "Loading the on-device pose model…",
  tracking: "Pose found — stand tall to begin",
  reposition: "Step back so shoulder, hip, knee and ankle are visible",
  pain: "Session paused — do not continue through pain",
  error: "Camera could not start — use demo controls below",
};

const PHASE_COPY: Record<RepPhase, string> = {
  ready: "Stand tall",
  descending: "Lower with control",
  bottom: "Target range reached",
  ascending: "Return to standing",
};

function formatAngle(value: number | undefined) {
  return value === undefined ? "—" : `${Math.round(value)}°`;
}

export function PhysioTwinApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastUiUpdateRef = useRef(0);
  const trackerRef = useRef<RepTracker>(initialRepTracker());
  const drawingRef = useRef<DrawingUtils | null>(null);

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [phase, setPhase] = useState<RepPhase>("ready");
  const [metrics, setMetrics] = useState<PoseMetrics | null>(null);
  const [message, setMessage] = useState("Start the camera or use the backup demo controls.");
  const [reps, setReps] = useState<LoggedRep[]>([]);

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
      setMessage(decision.accepted ? "Accepted — movement quality passed." : decision.cue);
      speak(decision.cue);
    },
    [speak],
  );

  const stopCamera = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
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
      const advanced = advanceRep(trackerRef.current, nextMetrics);
      trackerRef.current = advanced.tracker;
      setPhase(advanced.tracker.phase);
      if (advanced.decision) logDecision(advanced.decision);
    },
    [logDecision],
  );

  const predictFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || !streamRef.current) return;

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
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
          drawingRef.current.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
            color: "#68e3d2",
            lineWidth: 4,
          });
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

    animationRef.current = requestAnimationFrame(predictFrame);
  }, [analyzeLandmarks]);

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
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, options);
    } catch {
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" },
      });
    }
    return landmarkerRef.current;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
      setStatus("loading");
      setMessage("The video stays in this browser; only movement measurements are evaluated.");
      trackerRef.current = initialRepTracker();
      setPhase("ready");
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
      drawingRef.current = null;
      setStatus("tracking");
      animationRef.current = requestAnimationFrame(predictFrame);
    } catch (error) {
      console.error(error);
      stopCamera();
      setStatus("error");
      setMessage("Camera mode is unavailable. The backup demo still shows the complete product flow.");
    }
  }, [createLandmarker, predictFrame, stopCamera]);

  const painStop = useCallback(() => {
    stopCamera();
    setStatus("pain");
    setMessage("Session stopped. This prototype does not diagnose pain; contact the supervising therapist.");
    speak("Session stopped. Please contact your therapist.");
  }, [speak, stopCamera]);

  const simulateRep = useCallback(
    (accepted: boolean) => {
      const decision: RepDecision = accepted
        ? {
            accepted: true,
            minKneeAngle: 91,
            maxTrunkLean: 10,
            reason: "Movement stayed inside the prescribed bounds.",
            cue: "Good repetition.",
          }
        : {
            accepted: false,
            minKneeAngle: 88,
            maxTrunkLean: 24,
            reason: "Trunk compensation reached 24 degrees.",
            cue: "Keep your chest tall and retry.",
          };
      setMetrics({
        kneeAngle: decision.minKneeAngle,
        trunkLean: decision.maxTrunkLean,
        confidence: 0.93,
        side: "left",
      });
      logDecision(decision);
    },
    [logDecision],
  );

  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close();
    };
  }, [stopCamera]);

  const acceptedCount = reps.filter((rep) => rep.accepted).length;
  const qualityRate = reps.length ? Math.round((acceptedCount / reps.length) * 100) : 0;
  const cameraActive = status === "tracking" || status === "reposition" || status === "loading";

  return (
    <main className="shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="PhysioTwin home">
          <span className="brand-mark">PT</span>
          <span><strong>PHYSIOTWIN</strong><small>movement intelligence</small></span>
        </a>
        <div className="nav-meta">
          <span className="privacy-dot" /> On-device pose
          <span className="prototype-pill">Hackathon prototype</span>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">POST-OPERATIVE KNEE · DEMO PROTOCOL 01</p>
          <h1>Measure the movement,<br /><em>not only the angle.</em></h1>
          <p className="hero-intro">
            One chair-squat repetition. One compensation check. One precise cue — with the therapist still in control.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={startCamera} disabled={status === "loading"}>
              <span className="button-icon">●</span>{cameraActive ? "Restart camera" : "Start live assessment"}
            </button>
            <button className="stop-button" onClick={painStop}>Stop / I feel pain</button>
          </div>
          <p className="microcopy">Stand 2–3 metres away in side view. Keep shoulder, hip, knee and ankle visible.</p>
        </div>

        <div className="live-card" aria-label="Live movement assessment">
          <div className="live-header">
            <div><span className={`status-light ${status}`} /><strong>{STATUS_COPY[status]}</strong></div>
            <span className="session-id">SESSION 001</span>
          </div>
          <div className="camera-stage">
            <video ref={videoRef} playsInline muted aria-label="Live camera preview" />
            <canvas ref={canvasRef} aria-label="Pose landmark overlay" />
            {!cameraActive && (
              <div className="camera-placeholder">
                <div className="pose-figure" aria-hidden="true">
                  <span className="pose-head" /><span className="pose-body" />
                  <span className="pose-arm left" /><span className="pose-arm right" />
                  <span className="pose-leg left" /><span className="pose-leg right" />
                </div>
                <strong>Camera preview</strong>
                <span>Video is processed locally</span>
              </div>
            )}
            <div className="camera-badge">{cameraActive ? PHASE_COPY[phase] : "Awaiting session"}</div>
          </div>
          <div className="metric-strip">
            <div><span>Knee angle</span><strong>{formatAngle(metrics?.kneeAngle)}</strong><small>target 80–110°</small></div>
            <div className={metrics && metrics.trunkLean > 15 ? "metric-alert" : ""}><span>Trunk lean</span><strong>{formatAngle(metrics?.trunkLean)}</strong><small>limit &lt;15°</small></div>
            <div><span>Confidence</span><strong>{metrics ? metrics.confidence.toFixed(2) : "—"}</strong><small>gate ≥0.55</small></div>
          </div>
          <div className="coach-message" aria-live="polite"><span>COACH</span><p>{message}</p></div>
        </div>
      </section>

      <section className="demo-band" aria-labelledby="demo-title">
        <div>
          <p className="eyebrow" id="demo-title">BACKUP DEMO CONTROLS</p>
          <h2>Show the complete story even if venue Wi‑Fi or camera permissions fail.</h2>
        </div>
        <div className="demo-actions">
          <button onClick={() => simulateRep(false)}>Simulate wrong rep <span>24° trunk</span></button>
          <button onClick={() => simulateRep(true)}>Simulate corrected rep <span>10° trunk</span></button>
        </div>
      </section>

      <section className="dashboard" aria-labelledby="summary-title">
        <div className="section-heading">
          <div><p className="eyebrow">THERAPIST VIEW</p><h2 id="summary-title">Exceptions, not hours of video.</h2></div>
          <p>Raw camera frames stay on the device. This prototype records only demo measurements and decisions.</p>
        </div>
        <div className="summary-grid">
          <article><span>Quality reps</span><strong>{acceptedCount}<small> / {reps.length || 0}</small></strong><p>Accepted inside all prescribed bounds</p></article>
          <article><span>Quality rate</span><strong>{qualityRate}<small>%</small></strong><p>Demo session movement-quality score</p></article>
          <article><span>Safety flags</span><strong>{reps.length - acceptedCount}</strong><p>Repetitions requiring review or retry</p></article>
        </div>
        <div className="event-panel">
          <div className="event-head"><span>REP</span><span>DECISION</span><span>MEASUREMENTS</span><span>REASON</span><span>TIME</span></div>
          {reps.length === 0 ? (
            <div className="empty-events">Complete a live repetition or use the backup demo controls.</div>
          ) : reps.slice(0, 5).map((rep) => (
            <div className="event-row" key={`${rep.id}-${rep.time}`}>
              <strong>#{String(rep.id).padStart(2, "0")}</strong>
              <span className={rep.accepted ? "decision-pass" : "decision-retry"}>{rep.accepted ? "ACCEPT" : "RETRY"}</span>
              <span>Knee {Math.round(rep.minKneeAngle)}° · Trunk {Math.round(rep.maxTrunkLean)}°</span>
              <span>{rep.reason}</span>
              <span>{rep.time}</span>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <strong>PHYSIOTWIN</strong>
        <p>Supports therapist-prescribed rehabilitation. Does not diagnose, prescribe autonomously or replace emergency care.</p>
        <span>NUMENORS · HACKVENTURE 2K26</span>
      </footer>
    </main>
  );
}
