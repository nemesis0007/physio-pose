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
import { recordExerciseActivity } from "./profile-storage";
import { currentUsername } from "./auth-storage";
import {
  advanceProtocol,
  getPoseMetrics,
  initialRepTracker,
  metricValue,
  REQUIRED_CONFIDENCE,
  validatePoseFrame,
  type PoseMetrics,
  type RepDecision,
  type RepPhase,
  type RepTracker,
} from "./movement";
import {
  assessMovement,
  buildCalibration,
  projectProgress,
  type CalibrationProfile,
  type MovementInsight,
  type ProgressSession,
} from "./intelligence";

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
  recordedAt: string;
  confidence: number;
  symmetry: number;
  cameraQuality: number;
  issues: string[];
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
const SMOOTHING_ALPHA = 0.32;

function interpolate(previous: number, current: number) {
  return previous + (current - previous) * SMOOTHING_ALPHA;
}

function smoothMetrics(
  previous: PoseMetrics | null,
  current: PoseMetrics,
): PoseMetrics {
  if (!previous || previous.side !== current.side) return current;
  return {
    kneeAngle: interpolate(previous.kneeAngle, current.kneeAngle),
    kneeBend: interpolate(previous.kneeBend, current.kneeBend),
    hipAngle: interpolate(previous.hipAngle, current.hipAngle),
    shoulderAngle: interpolate(
      previous.shoulderAngle,
      current.shoulderAngle,
    ),
    elbowAngle: interpolate(previous.elbowAngle, current.elbowAngle),
    elbowBend: interpolate(previous.elbowBend, current.elbowBend),
    ankleAngle: interpolate(previous.ankleAngle, current.ankleAngle),
    trunkLean: interpolate(previous.trunkLean, current.trunkLean),
    pelvisTilt: interpolate(previous.pelvisTilt, current.pelvisTilt),
    wristSpan: interpolate(previous.wristSpan, current.wristSpan),
    kneeSpan: interpolate(previous.kneeSpan, current.kneeSpan),
    ankleSpan: interpolate(previous.ankleSpan, current.ankleSpan),
    heelLift: interpolate(previous.heelLift, current.heelLift),
    reachSpan: interpolate(previous.reachSpan, current.reachSpan),
    singleLegLift: interpolate(
      previous.singleLegLift,
      current.singleLegLift,
    ),
    confidence: current.confidence,
    side: current.side,
    leftKneeAngle: interpolate(
      previous.leftKneeAngle,
      current.leftKneeAngle,
    ),
    rightKneeAngle: interpolate(
      previous.rightKneeAngle,
      current.rightKneeAngle,
    ),
    leftElbowBend: interpolate(
      previous.leftElbowBend,
      current.leftElbowBend,
    ),
    rightElbowBend: interpolate(
      previous.rightElbowBend,
      current.rightElbowBend,
    ),
    leftShoulderAngle: interpolate(
      previous.leftShoulderAngle,
      current.leftShoulderAngle,
    ),
    rightShoulderAngle: interpolate(
      previous.rightShoulderAngle,
      current.rightShoulderAngle,
    ),
    leftHipAngle: interpolate(previous.leftHipAngle, current.leftHipAngle),
    rightHipAngle: interpolate(
      previous.rightHipAngle,
      current.rightHipAngle,
    ),
    symmetryScore: interpolate(
      previous.symmetryScore,
      current.symmetryScore,
    ),
  };
}

function escapeReportText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

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
  const smoothedMetricsRef = useRef<PoseMetrics | null>(null);
  const lastRawMetricsRef = useRef<PoseMetrics | null>(null);
  const stableFrameCountRef = useRef(0);
  const sessionStartedAtRef = useRef(new Date());
  const temporalFramesRef = useRef<PoseMetrics[]>([]);
  const insightRef = useRef<MovementInsight | null>(null);
  const lastRecognitionRef = useRef(0);

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sourceMode, setSourceMode] = useState<SourceMode>(null);
  const [phase, setPhase] = useState<RepPhase>("ready");
  const [metrics, setMetrics] = useState<PoseMetrics | null>(null);
  const [message, setMessage] = useState(
    "Start the camera, choose an exercise video or use the backup demo.",
  );
  const [reps, setReps] = useState<LoggedRep[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState(
    "chair-sit-to-stand",
  );
  const [calibration, setCalibration] =
    useState<CalibrationProfile | null>(null);
  const [autoRecognize, setAutoRecognize] = useState(true);
  const [insight, setInsight] = useState<MovementInsight>(() =>
    assessMovement([], "chair-sit-to-stand", null),
  );
  const [progressSessions, setProgressSessions] = useState<ProgressSession[]>(
    [],
  );
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setProfileId(currentUsername()),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("exercise");
    if (query && EXERCISES.some((exercise) => exercise.id === query)) {
      const timer = window.setTimeout(() => setSelectedExerciseId(query), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("physiotwin-progress");
      if (stored) {
        const parsed = JSON.parse(stored) as ProgressSession[];
        const timer = window.setTimeout(
          () => setProgressSessions(parsed.slice(-20)),
          0,
        );
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Private mode or blocked storage: the current session still works.
    }
  }, []);

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
      const currentInsight = insightRef.current;
      setReps((current) => [
        {
          ...decision,
          id: current.length + 1,
          recordedAt: new Date().toISOString(),
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          confidence: metrics?.confidence ?? 0,
          symmetry: currentInsight?.symmetry || 91,
          cameraQuality: currentInsight?.cameraQuality || 94,
          issues: currentInsight?.issues ?? [],
        },
        ...current,
      ]);
      const progressEntry: ProgressSession = {
        date: new Date().toISOString(),
        exerciseId: selectedExerciseId,
        score: decision.score,
        symmetry: currentInsight?.symmetry || 91,
        confidence: metrics?.confidence ?? 0,
      };
      setProgressSessions((current) => {
        const next = [...current, progressEntry].slice(-20);
        try {
          window.localStorage.setItem(
            "physiotwin-progress",
            JSON.stringify(next),
          );
        } catch {
          // Local progress history is optional.
        }
        return next;
      });
      if (profileId) {
        try {
          recordExerciseActivity(profileId, {
            exerciseId: selectedExercise.id,
            exerciseName: selectedExercise.name,
            accepted: decision.accepted,
            score: decision.score,
          });
        } catch {
          // A blocked browser store should never interrupt the assessment.
        }
      }
      setMessage(
        decision.accepted
          ? `Accepted — heuristic quality score ${decision.score}/100.`
          : decision.cue,
      );
      speak(decision.cue);
    },
    [
      metrics?.confidence,
      profileId,
      selectedExercise.id,
      selectedExercise.name,
      selectedExerciseId,
      speak,
    ],
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
      const frameCheck = validatePoseFrame(landmarks);
      if (!frameCheck.valid) {
        stableFrameCountRef.current = 0;
        trackerRef.current = initialRepTracker();
        setPhase("ready");
        setStatus("reposition");
        setMessage(frameCheck.reason);
        return;
      }

      const rawMetrics = getPoseMetrics(landmarks);
      if (!rawMetrics) return;

      const previousRaw = lastRawMetricsRef.current;
      lastRawMetricsRef.current = rawMetrics;
      if (previousRaw?.side === rawMetrics.side) {
        const primaryJump = Math.abs(
          metricValue(rawMetrics, scoringProfile.metric) -
            metricValue(previousRaw, scoringProfile.metric),
        );
        const compensationJump = Math.abs(
          metricValue(rawMetrics, scoringProfile.compensationMetric) -
            metricValue(previousRaw, scoringProfile.compensationMetric),
        );
        const jumpLimit = scoringProfile.unit === "°" ? 32 : 45;
        if (primaryJump > jumpLimit || compensationJump > jumpLimit) {
          stableFrameCountRef.current = 0;
          setStatus("reposition");
          setMessage(
            "Landmarks changed too quickly. Hold the camera steady and keep the full body visible.",
          );
          return;
        }
      }

      const nextMetrics = smoothMetrics(
        smoothedMetricsRef.current,
        rawMetrics,
      );
      smoothedMetricsRef.current = nextMetrics;
      temporalFramesRef.current = [
        ...temporalFramesRef.current.slice(-59),
        nextMetrics,
      ];
      const nextInsight = assessMovement(
        temporalFramesRef.current,
        selectedExerciseId,
        calibration,
      );
      insightRef.current = nextInsight;

      if (performance.now() - lastUiUpdateRef.current > 90) {
        setMetrics(nextMetrics);
        setInsight(nextInsight);
        lastUiUpdateRef.current = performance.now();
      }

      if (
        autoRecognize &&
        nextInsight.detectionConfidence >= 0.84 &&
        performance.now() - lastRecognitionRef.current > 1800
      ) {
        const recognizedId = nextInsight.detectedExercise
          .toLowerCase()
          .replaceAll(" ", "-")
          .replace("…", "");
        if (
          recognizedId !== selectedExerciseId &&
          EXERCISES.some((exercise) => exercise.id === recognizedId)
        ) {
          setSelectedExerciseId(recognizedId);
          setMessage(
            `Movement recognized as ${nextInsight.detectedExercise}. Protocol switched automatically.`,
          );
        }
        lastRecognitionRef.current = performance.now();
      }

      if (nextMetrics.confidence < REQUIRED_CONFIDENCE) {
        stableFrameCountRef.current = 0;
        trackerRef.current = initialRepTracker();
        setPhase("ready");
        setStatus("reposition");
        setMessage(
          "Tracking confidence is low. Improve lighting and keep the full body visible.",
        );
        return;
      }

      stableFrameCountRef.current += 1;
      if (stableFrameCountRef.current < 3) {
        setStatus("reposition");
        setMessage("Hold position briefly while tracking stabilizes.");
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
    [
      autoRecognize,
      calibration,
      logDecision,
      scoringProfile,
      selectedExerciseId,
    ],
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
        modelAssetPath: "/models/pose_landmarker_full.task",
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.65,
      minPosePresenceConfidence: 0.65,
      minTrackingConfidence: 0.65,
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
    smoothedMetricsRef.current = null;
    lastRawMetricsRef.current = null;
    stableFrameCountRef.current = 0;
    temporalFramesRef.current = [];
    insightRef.current = null;
    sessionStartedAtRef.current = new Date();
    setPhase("ready");
    setMetrics(null);
    setReps([]);
    setInsight(assessMovement([], selectedExerciseId, calibration));
  }, [calibration, selectedExerciseId]);

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
      "Session stopped. Rest and contact your physiotherapist if pain continues.",
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

  const calibrateMovement = useCallback(() => {
    const profile = buildCalibration(temporalFramesRef.current.slice(-45));
    if (!profile) {
      setMessage(
        "Keep your full body visible and hold a comfortable neutral position for two seconds.",
      );
      return;
    }
    setCalibration(profile);
    setMessage(
      "Personal baseline saved. Range, symmetry and confidence are now adjusted to you.",
    );
  }, []);

  const downloadReport = useCallback(() => {
    if (reps.length === 0) return;

    const chronologicalReps = [...reps].reverse();
    const accepted = chronologicalReps.filter((rep) => rep.accepted).length;
    const acceptanceRate = Math.round(
      (accepted / chronologicalReps.length) * 100,
    );
    const generatedAt = new Date();
    const rows = chronologicalReps
      .map(
        (rep) => `
          <tr>
            <td>#${String(rep.id).padStart(2, "0")}</td>
            <td class="${rep.accepted ? "pass" : "retry"}">
              ${rep.accepted ? "ACCEPT" : "RETRY"}
            </td>
            <td>${rep.score}/100</td>
            <td>
              ${escapeReportText(rep.primaryLabel)}:
              ${Math.round(rep.primaryValue)}${rep.primaryUnit}
            </td>
            <td>
              ${escapeReportText(rep.compensationLabel)}:
              ${Math.round(rep.compensationValue)}${rep.compensationUnit}
            </td>
            <td>${escapeReportText(rep.reason)}</td>
            <td>${Math.round(rep.symmetry)}%</td>
            <td>${Math.round(rep.cameraQuality)}%</td>
            <td>${escapeReportText(rep.time)}</td>
          </tr>`,
      )
      .join("");

    const report = `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width" />
          <title>PhysioTwin session report</title>
          <style>
            body { font: 14px/1.5 Arial, sans-serif; color: #102b3b; margin: 40px; }
            header { border-bottom: 3px solid #0d7c78; padding-bottom: 18px; }
            h1 { margin: 0; font-size: 30px; }
            h2 { margin-top: 30px; font-size: 20px; }
            .meta, .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
            .box { border: 1px solid #cbd8da; border-radius: 8px; padding: 14px; }
            .box span { color: #65777f; display: block; font-size: 11px; text-transform: uppercase; }
            .box strong { display: block; font-size: 22px; margin-top: 4px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border-bottom: 1px solid #dfe7e8; padding: 10px 7px; text-align: left; vertical-align: top; }
            th { background: #edf5f4; font-size: 11px; text-transform: uppercase; }
            .pass { color: #08765b; font-weight: bold; }
            .retry { color: #b4413a; font-weight: bold; }
            footer { color: #65777f; font-size: 11px; margin-top: 28px; }
            @media print { body { margin: 18px; } }
          </style>
        </head>
        <body>
          <header>
            <h1>PhysioTwin session report</h1>
            <p>Explainable movement assessment · generated locally</p>
          </header>
          <section class="meta">
            <div class="box"><span>Exercise</span><strong>${escapeReportText(selectedExercise.name)}</strong></div>
            <div class="box"><span>Session started</span><strong>${escapeReportText(sessionStartedAtRef.current.toLocaleString())}</strong></div>
            <div class="box"><span>Generated</span><strong>${escapeReportText(generatedAt.toLocaleString())}</strong></div>
          </section>
          <section class="summary">
            <div class="box"><span>Accepted attempts</span><strong>${accepted}/${chronologicalReps.length}</strong></div>
            <div class="box"><span>Acceptance rate</span><strong>${acceptanceRate}%</strong></div>
            <div class="box"><span>Review flags</span><strong>${chronologicalReps.length - accepted}</strong></div>
          </section>
          <h2>Attempt details</h2>
          <table>
            <thead>
              <tr>
                <th>Rep</th><th>Decision</th><th>Score</th>
                <th>Primary measure</th><th>Compensation</th>
                <th>Reason</th><th>Symmetry</th><th>Capture</th><th>Time</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <footer>
            Pose estimation: MediaPipe Pose Landmarker Full. Video frames were
            processed locally and are not included in this report.
          </footer>
        </body>
      </html>`;

    const blob = new Blob([report], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `physiotwin-${selectedExercise.id}-${generatedAt
      .toISOString()
      .slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [reps, selectedExercise.id, selectedExercise.name]);

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
  const exerciseProgress = progressSessions.filter(
    (session) => session.exerciseId === selectedExerciseId,
  );
  const progressProjection = projectProgress(exerciseProgress);
  const averageSymmetry = reps.length
    ? Math.round(
        reps.reduce((sum, rep) => sum + rep.symmetry, 0) / reps.length,
      )
    : Math.round(insight.symmetry);
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
          <p className="eyebrow">PRIVATE MOVEMENT INTELLIGENCE</p>
          <h1>
            Your movement.
            <br />
            <em>Clearly understood.</em>
          </h1>
          <p className="hero-intro">
            A private, adaptive assessment that recognizes exercise, measures
            form over time and explains exactly what changed—frame by frame.
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
                  "Protocol ready. Use the recommended camera view for the clearest movement score.",
                );
              }}
            >
              {EXERCISES.map((exercise) => (
                <option value={exercise.id} key={exercise.id}>
                  {exercise.category} — {exercise.name}
                </option>
              ))}
            </select>
            <small>
              Explainable heuristic scoring available for every protocol ·
              temporal analysis · on-device
            </small>
          </label>
          <div className="intelligence-controls">
            <button
              type="button"
              className={calibration ? "calibrated" : ""}
              onClick={calibrateMovement}
            >
              <span>{calibration ? "✓" : "01"}</span>
              {calibration ? "Baseline calibrated" : "Calibrate to me"}
            </button>
            <label>
              <input
                type="checkbox"
                checked={autoRecognize}
                onChange={(event) => setAutoRecognize(event.target.checked)}
              />
              <span>Auto-recognize movement</span>
            </label>
          </div>

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
            Nothing leaves this device. Stop immediately if you feel pain;
            results support—not replace—clinical judgement. Videos up to 250 MB
            are processed locally.
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
            <div className={`quality-badge ${insight.readiness}`}>
              <span />
              {insight.readiness === "reposition"
                ? "Camera check"
                : `${insight.cameraQuality}% capture quality`}
            </div>
            <div className="live-rep-hud" aria-live="polite">
              <div>
                <span>REPS</span>
                <strong>{reps.length}</strong>
              </div>
              <div>
                <span>LAST RESULT</span>
                <strong
                  className={
                    reps[0]
                      ? reps[0].accepted
                        ? "hud-pass"
                        : "hud-retry"
                      : ""
                  }
                >
                  {reps[0]
                    ? reps[0].accepted
                      ? "Counted"
                      : "Retry"
                    : "Waiting"}
                </strong>
              </div>
            </div>
          </div>
          <div className="metric-strip metric-strip-four">
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
              <small>gate ≥{REQUIRED_CONFIDENCE.toFixed(2)}</small>
            </div>
            <div>
              <span>Symmetry</span>
              <strong>{metrics ? `${Math.round(insight.symmetry)}%` : "—"}</strong>
              <small>bilateral joint agreement</small>
            </div>
          </div>
          <div className="coach-message" aria-live="polite">
            <span>COACH</span>
            <p>{message}</p>
          </div>
        </div>
      </section>

      <section className="live-results-dock" aria-label="Live rep results">
        <div className="dock-heading">
          <span className={`status-light ${status}`} />
          <div>
            <small>LIVE SESSION</small>
            <strong>
              {reps[0]
                ? reps[0].accepted
                  ? `Rep ${reps[0].id} counted`
                  : `Rep ${reps[0].id} needs another try`
                : "Your rep result will appear here"}
            </strong>
          </div>
        </div>
        <div className="dock-stat">
          <small>Total reps</small>
          <strong>{reps.length}</strong>
        </div>
        <div className="dock-stat">
          <small>Accepted</small>
          <strong>{acceptedCount}</strong>
        </div>
        <div className="dock-stat">
          <small>Last score</small>
          <strong>{reps[0]?.score ?? "—"}</strong>
        </div>
        <div className="dock-cue">
          <small>Latest cue</small>
          <p>{reps[0]?.cue ?? message}</p>
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

      <section className="intelligence-deck" aria-label="Movement intelligence">
        <article>
          <span className="intel-index">01</span>
          <div>
            <small>Movement recognition</small>
            <strong>{insight.detectedExercise}</strong>
            <p>
              {insight.detectionConfidence
                ? `${Math.round(insight.detectionConfidence * 100)}% temporal match`
                : "Collecting a short motion sequence"}
            </p>
          </div>
        </article>
        <article>
          <span className="intel-index">02</span>
          <div>
            <small>Personal calibration</small>
            <strong>{calibration ? "Active" : "Not calibrated"}</strong>
            <p>
              {calibration
                ? "Thresholds adjusted to your neutral posture"
                : "Hold a neutral pose, then calibrate"}
            </p>
          </div>
        </article>
        <article>
          <span className="intel-index">03</span>
          <div>
            <small>Current form signals</small>
            <strong>
              {insight.issues.length
                ? `${insight.issues.length} to review`
                : "No flags"}
            </strong>
            <p>{insight.issues[0] ?? "Motion quality is within the current profile"}</p>
          </div>
        </article>
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
            <h2 id="summary-title">A complete movement story.</h2>
          </div>
          <div className="summary-actions">
            <p>
              Raw frames stay on the device. The session records only movement
              measurements, rep decisions and coaching events.
            </p>
            <button
              className="report-button"
              type="button"
              onClick={downloadReport}
              disabled={reps.length === 0}
            >
              Download session report
              <span>HTML · printable and locally generated</span>
            </button>
          </div>
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
            <span>Movement symmetry</span>
            <strong>
              {averageSymmetry}
              <small>%</small>
            </strong>
            <p>Average left-right joint agreement</p>
          </article>
          <article>
            <span>3-session projection</span>
            <strong>
              {progressProjection.projected}
              <small>%</small>
            </strong>
            <p>
              {progressProjection.trend >= 0 ? "Improving" : "Review needed"} ·
              local trend estimate
            </p>
          </article>
        </div>
        <div className="analytics-grid">
          <article className="timeline-card">
            <div className="analytics-heading">
              <div>
                <span>TEMPORAL FORM MAP</span>
                <strong>Every repetition, explained.</strong>
              </div>
              <small>green accepted · coral review</small>
            </div>
            <div className="rep-timeline">
              {reps.length ? (
                [...reps].reverse().map((rep) => (
                  <button
                    type="button"
                    className={rep.accepted ? "timeline-pass" : "timeline-retry"}
                    key={`timeline-${rep.id}`}
                    title={`${rep.cue} ${rep.issues.join(". ")}`}
                  >
                    <span>{rep.id}</span>
                    <small>{rep.score}</small>
                  </button>
                ))
              ) : (
                <div className="timeline-empty">
                  Complete repetitions to build the form timeline.
                </div>
              )}
            </div>
          </article>
          <article className="body-map-card">
            <div className="analytics-heading">
              <div>
                <span>ASYMMETRY MAP</span>
                <strong>{averageSymmetry}% balanced</strong>
              </div>
            </div>
            <div className="body-map">
              <div className="body-silhouette" aria-hidden="true">
                <i className="body-head" />
                <i className="body-core" />
                <i className="body-limb arm-left" />
                <i className="body-limb arm-right" />
                <i className="body-limb leg-left" />
                <i className="body-limb leg-right" />
              </div>
              <div className="symmetry-bars">
                <span><i style={{ width: `${averageSymmetry}%` }} /></span>
                <p>
                  {averageSymmetry >= 85
                    ? "Sides are moving consistently."
                    : "A side-to-side difference needs review."}
                </p>
              </div>
            </div>
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
