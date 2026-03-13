import { ExerciseCatalogItem } from "./exercise-catalog";

// ─── Days of the Week ─────────────────────────────────

export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// ─── Routine Templates ───────────────────────────────

export interface RoutineTemplate {
  id: string;
  name: string;
  description: string;
  daysPerWeek: number;
  dayLabels: string[]; // e.g. ["Push", "Pull", "Legs"]
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: "ppl",
    name: "Push / Pull / Legs",
    description:
      "Classic 3-day split targeting push muscles, pull muscles, and legs separately.",
    daysPerWeek: 3,
    dayLabels: ["Push", "Pull", "Legs"],
  },
  {
    id: "ppl6",
    name: "Push / Pull / Legs (6-Day)",
    description: "High-frequency 6-day split running PPL twice per week.",
    daysPerWeek: 6,
    dayLabels: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"],
  },
  {
    id: "upper-lower",
    name: "Upper / Lower",
    description: "4-day split alternating upper body and lower body workouts.",
    daysPerWeek: 4,
    dayLabels: ["Upper", "Lower", "Upper", "Lower"],
  },
  {
    id: "bro-split",
    name: "Bro Split (5-Day)",
    description:
      "Traditional bodybuilding split with one muscle group per day.",
    daysPerWeek: 5,
    dayLabels: ["Chest", "Back", "Shoulders", "Arms", "Legs"],
  },
  {
    id: "full-body",
    name: "Full Body (3-Day)",
    description: "Hit every muscle group each session, ideal for beginners.",
    daysPerWeek: 3,
    dayLabels: ["Full Body A", "Full Body B", "Full Body C"],
  },
  {
    id: "custom",
    name: "Custom",
    description:
      "Build your own routine from scratch. Choose how many days you train and configure rest days.",
    daysPerWeek: 0, // user picks
    dayLabels: [],
  },
];

// ─── Warmup Types ────────────────────────────────────

export const WARMUP_TYPES = [
  "Stretching",
  "Elliptical",
  "Light Jogging",
  "Jump Rope",
  "Foam Rolling",
  "Dynamic Warmup",
] as const;

export type WarmupType = (typeof WARMUP_TYPES)[number];

// ─── Cardio Types ────────────────────────────────────

export const CARDIO_TYPES = [
  "Treadmill",
  "Elliptical",
  "Cycling",
  "Rowing",
  "Stair Climber",
] as const;

export type CardioType = (typeof CARDIO_TYPES)[number];

// ─── Cardio Segment ──────────────────────────────────

export interface CardioSegment {
  id: string;
  durationMinutes: string; // stored as string for input
  // Treadmill specific
  speed?: string; // km/h or mph
  incline?: string; // %
  // Elliptical / Cycling / Rowing / Stair Climber
  resistance?: string; // level
}

// ─── Routine Day Config ──────────────────────────────

export interface RoutineDayExercise {
  id: string;
  catalogId: string;
  name: string;
  equipment: string;
  sets: number;
  reps: string; // e.g. "8-12"
}

export interface RoutineDay {
  label: string; // e.g. "Push", "Day 1", or "Rest"
  isRest: boolean;
  dayOfWeek: DayOfWeek;
  exercises: RoutineDayExercise[];
}

// ─── Full Routine ────────────────────────────────────

export interface Routine {
  id: string;
  name: string;
  templateId: string;
  cycleStartDay: DayOfWeek;
  days: RoutineDay[];
  // Warmup
  hasWarmup: boolean;
  warmupType?: WarmupType;
  warmupDurationMinutes?: number;
  // Cardio
  hasCardio: boolean;
  cardioType?: CardioType;
  cardioSegments?: CardioSegment[];
  // Meta
  createdAt: string;
}

// ─── Mock Saved Routines ─────────────────────────────

export const mockRoutines: Routine[] = [
  {
    id: "r1",
    name: "My PPL Routine",
    templateId: "ppl",
    cycleStartDay: "Monday",
    days: [
      {
        label: "Push",
        isRest: false,
        dayOfWeek: "Monday",
        exercises: [
          {
            id: "rd1",
            catalogId: "cat5",
            name: "Bench Press",
            equipment: "Barbell",
            sets: 4,
            reps: "8-12",
          },
          {
            id: "rd2",
            catalogId: "cat16",
            name: "Incline Bench Press",
            equipment: "Barbell",
            sets: 3,
            reps: "10-12",
          },
          {
            id: "rd3",
            catalogId: "cat18",
            name: "Lateral Raises",
            equipment: "Dumbbell",
            sets: 3,
            reps: "12-15",
          },
          {
            id: "rd4",
            catalogId: "cat30",
            name: "Tricep Pushdowns",
            equipment: "Cable",
            sets: 3,
            reps: "10-12",
          },
        ],
      },
      {
        label: "Pull",
        isRest: false,
        dayOfWeek: "Wednesday",
        exercises: [
          {
            id: "rd5",
            catalogId: "cat11",
            name: "Deadlift",
            equipment: "Barbell",
            sets: 3,
            reps: "5-8",
          },
          {
            id: "rd6",
            catalogId: "cat22",
            name: "Barbell Rows",
            equipment: "Barbell",
            sets: 4,
            reps: "8-12",
          },
          {
            id: "rd7",
            catalogId: "cat17",
            name: "Lat Pulldowns",
            equipment: "Machine",
            sets: 3,
            reps: "10-12",
          },
          {
            id: "rd8",
            catalogId: "cat6",
            name: "Bicep Curls",
            equipment: "Dumbbell",
            sets: 3,
            reps: "10-12",
          },
        ],
      },
      {
        label: "Legs",
        isRest: false,
        dayOfWeek: "Friday",
        exercises: [
          {
            id: "rd9",
            catalogId: "cat28",
            name: "Squats",
            equipment: "Barbell",
            sets: 4,
            reps: "6-10",
          },
          {
            id: "rd10",
            catalogId: "cat19",
            name: "Leg Extensions",
            equipment: "Machine",
            sets: 3,
            reps: "12-15",
          },
          {
            id: "rd11",
            catalogId: "cat15",
            name: "Hamstring Curls",
            equipment: "Machine",
            sets: 3,
            reps: "10-12",
          },
          {
            id: "rd12",
            catalogId: "cat9",
            name: "Calf Raises",
            equipment: "Machine",
            sets: 4,
            reps: "15-20",
          },
        ],
      },
      { label: "Rest", isRest: true, dayOfWeek: "Tuesday", exercises: [] },
      { label: "Rest", isRest: true, dayOfWeek: "Thursday", exercises: [] },
      { label: "Rest", isRest: true, dayOfWeek: "Saturday", exercises: [] },
      { label: "Rest", isRest: true, dayOfWeek: "Sunday", exercises: [] },
    ],
    hasWarmup: true,
    warmupType: "Stretching",
    warmupDurationMinutes: 5,
    hasCardio: true,
    cardioType: "Treadmill",
    cardioSegments: [
      { id: "cs1", durationMinutes: "5", speed: "6", incline: "1" },
      { id: "cs2", durationMinutes: "10", speed: "8", incline: "3" },
      { id: "cs3", durationMinutes: "5", speed: "5", incline: "0" },
    ],
    createdAt: "2024-01-01T00:00:00Z",
  },
];
