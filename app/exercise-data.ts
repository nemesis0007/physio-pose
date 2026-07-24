export type ExerciseCategory =
  | "Knee"
  | "Hip"
  | "Shoulder"
  | "Spine & core"
  | "Ankle & foot"
  | "Balance";

export type Exercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  level: "Starter" | "Progressing" | "Advanced";
  equipment: string;
  position: string;
  focus: string;
  cue: string;
  automatedScoring: boolean;
};

export type MetricKey =
  | "kneeAngle"
  | "kneeBend"
  | "hipAngle"
  | "shoulderAngle"
  | "elbowAngle"
  | "elbowBend"
  | "ankleAngle"
  | "trunkLean"
  | "pelvisTilt"
  | "wristSpan"
  | "kneeSpan"
  | "ankleSpan"
  | "heelLift"
  | "reachSpan"
  | "singleLegLift";

export type ScoringProfile = {
  mode: "rep" | "hold";
  metric: MetricKey;
  primaryLabel: string;
  unit: "°" | "%";
  direction: "increase" | "decrease";
  startThreshold: number;
  targetMin: number;
  targetMax: number;
  returnThreshold: number;
  targetText: string;
  compensationMetric: MetricKey;
  compensationLabel: string;
  compensationUnit: "°" | "%";
  compensationMax: number;
  rangeCue: string;
  compensationCue: string;
  holdSeconds?: number;
};

const EXERCISE_LIBRARY: Exercise[] = [
  {
    id: "chair-sit-to-stand",
    name: "Chair sit-to-stand",
    category: "Knee",
    level: "Starter",
    equipment: "Stable chair",
    position: "Side view",
    focus: "Knee range and trunk control",
    cue: "Keep your chest tall and press evenly through both feet.",
    automatedScoring: true,
  },
  {
    id: "heel-slide",
    name: "Supine heel slide",
    category: "Knee",
    level: "Starter",
    equipment: "Mat or bed",
    position: "Side view",
    focus: "Gentle knee flexion",
    cue: "Slide the heel slowly without forcing the range.",
    automatedScoring: false,
  },
  {
    id: "seated-knee-extension",
    name: "Seated knee extension",
    category: "Knee",
    level: "Starter",
    equipment: "Chair",
    position: "Side view",
    focus: "Quadriceps control",
    cue: "Straighten the knee without lifting the thigh.",
    automatedScoring: false,
  },
  {
    id: "straight-leg-raise",
    name: "Straight-leg raise",
    category: "Knee",
    level: "Progressing",
    equipment: "Mat",
    position: "Side view",
    focus: "Quadriceps and hip flexor control",
    cue: "Keep the knee straight and lift only to the prescribed height.",
    automatedScoring: false,
  },
  {
    id: "mini-squat",
    name: "Supported mini squat",
    category: "Knee",
    level: "Progressing",
    equipment: "Counter or rail",
    position: "Side view",
    focus: "Controlled weight bearing",
    cue: "Hips back, knees aligned with the second toe.",
    automatedScoring: false,
  },
  {
    id: "step-up",
    name: "Low step-up",
    category: "Knee",
    level: "Advanced",
    equipment: "Low stable step",
    position: "Front or side view",
    focus: "Single-leg control",
    cue: "Keep the pelvis level and lower with control.",
    automatedScoring: false,
  },
  {
    id: "glute-bridge",
    name: "Glute bridge",
    category: "Hip",
    level: "Starter",
    equipment: "Mat",
    position: "Side view",
    focus: "Hip extension strength",
    cue: "Lift through the hips without arching the lower back.",
    automatedScoring: false,
  },
  {
    id: "clamshell",
    name: "Side-lying clamshell",
    category: "Hip",
    level: "Starter",
    equipment: "Mat",
    position: "Front oblique view",
    focus: "Hip rotator strength",
    cue: "Keep the pelvis stacked as the top knee opens.",
    automatedScoring: false,
  },
  {
    id: "hip-abduction",
    name: "Side-lying hip abduction",
    category: "Hip",
    level: "Progressing",
    equipment: "Mat",
    position: "Front view",
    focus: "Gluteus medius strength",
    cue: "Lead with the heel and keep the toes facing forward.",
    automatedScoring: false,
  },
  {
    id: "standing-hip-extension",
    name: "Standing hip extension",
    category: "Hip",
    level: "Progressing",
    equipment: "Counter or rail",
    position: "Side view",
    focus: "Hip extension without trunk compensation",
    cue: "Move the leg back without leaning the trunk.",
    automatedScoring: false,
  },
  {
    id: "pendulum",
    name: "Shoulder pendulum",
    category: "Shoulder",
    level: "Starter",
    equipment: "Table support",
    position: "Front oblique view",
    focus: "Gentle shoulder mobility",
    cue: "Let the arm stay relaxed while the body creates the motion.",
    automatedScoring: false,
  },
  {
    id: "wall-slide",
    name: "Shoulder wall slide",
    category: "Shoulder",
    level: "Starter",
    equipment: "Wall",
    position: "Side view",
    focus: "Assisted elevation",
    cue: "Slide only through the comfortable prescribed range.",
    automatedScoring: false,
  },
  {
    id: "shoulder-abduction",
    name: "Standing shoulder abduction",
    category: "Shoulder",
    level: "Progressing",
    equipment: "None",
    position: "Front view",
    focus: "Shoulder elevation control",
    cue: "Keep the shoulder relaxed as the arm moves outward.",
    automatedScoring: false,
  },
  {
    id: "external-rotation",
    name: "Band external rotation",
    category: "Shoulder",
    level: "Progressing",
    equipment: "Light resistance band",
    position: "Front view",
    focus: "Rotator cuff strength",
    cue: "Keep the elbow tucked against the side.",
    automatedScoring: false,
  },
  {
    id: "pelvic-tilt",
    name: "Supine pelvic tilt",
    category: "Spine & core",
    level: "Starter",
    equipment: "Mat",
    position: "Side view",
    focus: "Lumbopelvic control",
    cue: "Gently flatten the lower back without holding your breath.",
    automatedScoring: false,
  },
  {
    id: "cat-cow",
    name: "Cat-cow mobility",
    category: "Spine & core",
    level: "Starter",
    equipment: "Mat",
    position: "Side view",
    focus: "Spinal mobility",
    cue: "Move slowly and distribute the curve through the whole spine.",
    automatedScoring: false,
  },
  {
    id: "bird-dog",
    name: "Bird dog",
    category: "Spine & core",
    level: "Progressing",
    equipment: "Mat",
    position: "Side view",
    focus: "Trunk stability",
    cue: "Keep the pelvis level while reaching long.",
    automatedScoring: false,
  },
  {
    id: "prone-press-up",
    name: "Prone press-up",
    category: "Spine & core",
    level: "Progressing",
    equipment: "Mat",
    position: "Side view",
    focus: "Lumbar extension mobility",
    cue: "Relax the hips and stop if symptoms spread or intensify.",
    automatedScoring: false,
  },
  {
    id: "ankle-pumps",
    name: "Ankle pumps",
    category: "Ankle & foot",
    level: "Starter",
    equipment: "None",
    position: "Side view",
    focus: "Ankle mobility and circulation",
    cue: "Move the ankle up and down without moving the whole leg.",
    automatedScoring: false,
  },
  {
    id: "calf-raise",
    name: "Supported calf raise",
    category: "Ankle & foot",
    level: "Progressing",
    equipment: "Counter or rail",
    position: "Side view",
    focus: "Plantar-flexor strength",
    cue: "Rise straight up and lower slowly.",
    automatedScoring: false,
  },
  {
    id: "ankle-inversion-eversion",
    name: "Band inversion / eversion",
    category: "Ankle & foot",
    level: "Progressing",
    equipment: "Light resistance band",
    position: "Front view",
    focus: "Ankle control",
    cue: "Move from the ankle while keeping the knee still.",
    automatedScoring: false,
  },
  {
    id: "tandem-stance",
    name: "Tandem stance",
    category: "Balance",
    level: "Starter",
    equipment: "Counter nearby",
    position: "Front view",
    focus: "Narrow-base balance",
    cue: "Stand near support and keep your gaze on a fixed point.",
    automatedScoring: false,
  },
  {
    id: "single-leg-balance",
    name: "Supported single-leg balance",
    category: "Balance",
    level: "Progressing",
    equipment: "Counter nearby",
    position: "Front view",
    focus: "Single-leg stability",
    cue: "Use fingertip support and keep the pelvis level.",
    automatedScoring: false,
  },
  {
    id: "lateral-step",
    name: "Lateral stepping",
    category: "Balance",
    level: "Advanced",
    equipment: "Clear walkway",
    position: "Front view",
    focus: "Dynamic balance",
    cue: "Stay tall and place each foot with control.",
    automatedScoring: false,
  },
];

export const EXERCISES: Exercise[] = EXERCISE_LIBRARY.map((exercise) => ({
  ...exercise,
  automatedScoring: true,
}));

function rep(
  metric: MetricKey,
  primaryLabel: string,
  unit: "°" | "%",
  direction: "increase" | "decrease",
  startThreshold: number,
  targetMin: number,
  targetMax: number,
  returnThreshold: number,
  targetText: string,
  compensationMetric: MetricKey,
  compensationLabel: string,
  compensationUnit: "°" | "%",
  compensationMax: number,
  rangeCue: string,
  compensationCue: string,
): ScoringProfile {
  return {
    mode: "rep",
    metric,
    primaryLabel,
    unit,
    direction,
    startThreshold,
    targetMin,
    targetMax,
    returnThreshold,
    targetText,
    compensationMetric,
    compensationLabel,
    compensationUnit,
    compensationMax,
    rangeCue,
    compensationCue,
  };
}

function hold(
  metric: MetricKey,
  primaryLabel: string,
  unit: "°" | "%",
  targetMin: number,
  targetMax: number,
  targetText: string,
  compensationMetric: MetricKey,
  compensationLabel: string,
  compensationUnit: "°" | "%",
  compensationMax: number,
  holdSeconds: number,
): ScoringProfile {
  return {
    mode: "hold",
    metric,
    primaryLabel,
    unit,
    direction: "increase",
    startThreshold: targetMin,
    targetMin,
    targetMax,
    returnThreshold: targetMin,
    targetText,
    compensationMetric,
    compensationLabel,
    compensationUnit,
    compensationMax,
    rangeCue: "Move into the demonstrated hold position.",
    compensationCue: "Steady your body and use nearby support.",
    holdSeconds,
  };
}

export const SCORING_PROFILES: Record<string, ScoringProfile> = {
  "chair-sit-to-stand": rep(
    "kneeAngle", "Knee angle", "°", "decrease", 145, 80, 110, 155,
    "80–110°", "trunkLean", "Trunk lean", "°", 15,
    "Move through the demonstrated chair-squat range.",
    "Keep your chest tall and retry.",
  ),
  "heel-slide": rep(
    "kneeAngle", "Knee angle", "°", "decrease", 155, 90, 135, 165,
    "90–135°", "pelvisTilt", "Pelvis movement", "°", 45,
    "Slide the heel farther within the demonstrated range.",
    "Keep the pelvis quiet as the heel slides.",
  ),
  "seated-knee-extension": rep(
    "kneeAngle", "Knee extension", "°", "increase", 125, 155, 180, 115,
    "155–180°", "trunkLean", "Trunk lean", "°", 25,
    "Straighten the knee through the demonstrated range.",
    "Stay tall without leaning back.",
  ),
  "straight-leg-raise": rep(
    "hipAngle", "Hip angle", "°", "decrease", 165, 95, 145, 170,
    "95–145°", "kneeBend", "Knee bend", "°", 18,
    "Lift the straight leg through the demonstrated range.",
    "Keep the knee straight as the leg lifts.",
  ),
  "mini-squat": rep(
    "kneeAngle", "Knee angle", "°", "decrease", 160, 115, 145, 165,
    "115–145°", "trunkLean", "Trunk lean", "°", 18,
    "Lower a little farther with control.",
    "Keep your chest tall and knees aligned.",
  ),
  "step-up": rep(
    "kneeAngle", "Lead-knee angle", "°", "decrease", 150, 75, 125, 160,
    "75–125°", "pelvisTilt", "Pelvis tilt", "°", 20,
    "Lift the knee through the demonstrated step range.",
    "Keep the pelvis level as you step.",
  ),
  "glute-bridge": rep(
    "hipAngle", "Hip extension", "°", "increase", 120, 145, 180, 110,
    "145–180°", "pelvisTilt", "Pelvis tilt", "°", 25,
    "Lift the hips through the demonstrated range.",
    "Lift evenly without rotating the pelvis.",
  ),
  "clamshell": rep(
    "kneeSpan", "Knee separation", "%", "increase", 55, 70, 170, 58,
    "70–170%", "pelvisTilt", "Pelvis roll", "°", 35,
    "Open the top knee through the demonstrated range.",
    "Keep the pelvis stacked as the knee opens.",
  ),
  "hip-abduction": rep(
    "hipAngle", "Hip angle", "°", "decrease", 165, 105, 150, 170,
    "105–150°", "pelvisTilt", "Pelvis roll", "°", 30,
    "Lift the leg through the demonstrated range.",
    "Keep the pelvis stacked and lead with the heel.",
  ),
  "standing-hip-extension": rep(
    "hipAngle", "Hip angle", "°", "decrease", 170, 135, 165, 175,
    "135–165°", "trunkLean", "Trunk lean", "°", 15,
    "Move the leg backward through the demonstrated range.",
    "Keep the trunk upright as the leg moves.",
  ),
  pendulum: rep(
    "shoulderAngle", "Shoulder swing", "°", "increase", 12, 20, 65, 10,
    "20–65°", "elbowBend", "Elbow bend", "°", 45,
    "Let the relaxed arm swing through the demonstrated range.",
    "Keep the arm relaxed rather than actively bending it.",
  ),
  "wall-slide": rep(
    "shoulderAngle", "Shoulder elevation", "°", "increase", 55, 100, 175, 45,
    "100–175°", "trunkLean", "Trunk lean", "°", 18,
    "Slide upward through the demonstrated range.",
    "Keep the ribs and trunk controlled.",
  ),
  "shoulder-abduction": rep(
    "shoulderAngle", "Shoulder abduction", "°", "increase", 40, 70, 125, 30,
    "70–125°", "trunkLean", "Trunk lean", "°", 15,
    "Raise the arm through the demonstrated range.",
    "Stay tall without leaning to the side.",
  ),
  "external-rotation": rep(
    "wristSpan", "Wrist separation", "%", "increase", 90, 115, 230, 95,
    "115–230%", "elbowBend", "Elbow bend", "°", 110,
    "Rotate outward through the demonstrated range.",
    "Keep both elbows tucked and softly bent.",
  ),
  "pelvic-tilt": rep(
    "hipAngle", "Lumbopelvic angle", "°", "increase", 105, 115, 150, 100,
    "115–150°", "pelvisTilt", "Pelvis rotation", "°", 45,
    "Gently complete the demonstrated pelvic motion.",
    "Keep the movement small and controlled.",
  ),
  "cat-cow": rep(
    "hipAngle", "Trunk-hip angle", "°", "decrease", 160, 110, 150, 165,
    "110–150°", "elbowBend", "Elbow bend", "°", 25,
    "Move the spine through the demonstrated range.",
    "Keep the arms long and distribute the motion.",
  ),
  "bird-dog": rep(
    "reachSpan", "Opposite-limb reach", "%", "increase", 250, 300, 520, 260,
    "300–520%", "pelvisTilt", "Pelvis tilt", "°", 22,
    "Reach the opposite arm and leg farther.",
    "Keep the pelvis level while reaching.",
  ),
  "prone-press-up": rep(
    "elbowAngle", "Elbow extension", "°", "increase", 110, 145, 180, 100,
    "145–180°", "pelvisTilt", "Pelvis movement", "°", 40,
    "Press up through the demonstrated range.",
    "Keep the pelvis relaxed and centred.",
  ),
  "ankle-pumps": rep(
    "ankleAngle", "Ankle angle", "°", "increase", 110, 125, 170, 105,
    "125–170°", "kneeBend", "Knee bend", "°", 30,
    "Point the foot through the demonstrated range.",
    "Keep the knee and leg still.",
  ),
  "calf-raise": rep(
    "heelLift", "Heel lift", "%", "increase", 4, 6, 28, 3,
    "6–28%", "trunkLean", "Trunk lean", "°", 15,
    "Rise higher onto the toes with control.",
    "Stay tall and avoid leaning forward.",
  ),
  "ankle-inversion-eversion": rep(
    "ankleAngle", "Ankle angle", "°", "decrease", 105, 65, 100, 110,
    "65–100°", "kneeBend", "Knee bend", "°", 35,
    "Move the foot through the demonstrated range.",
    "Keep the knee still while the ankle moves.",
  ),
  "tandem-stance": hold(
    "trunkLean", "Trunk sway", "°", 0, 12, "≤12°",
    "pelvisTilt", "Pelvis tilt", "°", 18, 3,
  ),
  "single-leg-balance": hold(
    "singleLegLift", "Foot clearance", "%", 8, 100, "8–100%",
    "pelvisTilt", "Pelvis tilt", "°", 20, 3,
  ),
  "lateral-step": rep(
    "ankleSpan", "Step width", "%", "increase", 115, 145, 320, 120,
    "145–320%", "trunkLean", "Trunk lean", "°", 18,
    "Step wider through the demonstrated range.",
    "Keep the trunk tall as you step sideways.",
  ),
};

export function getScoringProfile(exerciseId: string) {
  return SCORING_PROFILES[exerciseId] ?? SCORING_PROFILES["chair-sit-to-stand"];
}

export const EXERCISE_CATEGORIES = [
  "All",
  "Knee",
  "Hip",
  "Shoulder",
  "Spine & core",
  "Ankle & foot",
  "Balance",
] as const;
