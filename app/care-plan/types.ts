export type CareAssignment = {
  id: number;
  patientId: string;
  therapistName: string;
  exerciseId: string;
  exerciseName: string;
  assignedDate: string;
  targetReps: number;
  notes: string;
  createdAt: string;
  totalReps: number;
  acceptedReps: number;
  bestScore: number;
};

export type CarePlanSummary = {
  totalReps: number;
  acceptedReps: number;
  bestScore: number;
  completedAssignments: number;
};

export type CarePlanResponse = {
  assignments: CareAssignment[];
  summary: CarePlanSummary;
  details: CarePlanDetails;
};

export type CarePlanDetails = {
  exerciseBreakdown: Array<{
    exerciseId: string;
    exerciseName: string;
    totalReps: number;
    acceptedReps: number;
    bestScore: number;
    lastActivity: string;
  }>;
  dailyActivity: Array<{
    date: string;
    totalReps: number;
    acceptedReps: number;
    bestScore: number;
  }>;
  recentActivity: Array<{
    id: number;
    exerciseName: string;
    accepted: boolean;
    score: number;
    occurredAt: string;
  }>;
};
