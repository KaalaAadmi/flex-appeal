export interface WorkoutSet {
  id: string;
  setNumber: number;
  weight: number;
  weightUnit: "kg" | "lbs";
  reps: number;
  restSeconds?: number;
}

export interface Exercise {
  id: string;
  name: string;
  equipment: string;
  sets: WorkoutSet[];
  tags?: string[];
}

export interface Workout {
  id: string;
  title: string;
  date: string; // ISO date string
  type: "Routine" | "Tracked Workout";
  description?: string;
  exercises: Exercise[];
  stats: {
    workingSets: number;
    duration: string; // e.g. "1:01:43"
    estCalories: number;
    totalWeight?: number;
    totalWeightUnit?: "kg" | "lbs";
    prs?: number;
  };
  exerciseNames: string[];
}

export const mockWorkouts: Workout[] = [
  {
    id: "1",
    title: "Leg Day",
    date: "2024-01-02T10:30:00Z",
    type: "Routine",
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.",
    exerciseNames: [
      "Squats",
      "Leg Extensions",
      "Flat Leg Raises",
      "Standing Calf Raises",
      "Bulgarian Split Squats",
    ],
    exercises: [
      {
        id: "e1",
        name: "Squats",
        equipment: "Barbell",
        sets: [
          {
            id: "s1",
            setNumber: 1,
            weight: 80,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 90,
          },
          {
            id: "s2",
            setNumber: 2,
            weight: 85,
            weightUnit: "kg",
            reps: 10,
            restSeconds: 90,
          },
          { id: "s3", setNumber: 3, weight: 90, weightUnit: "kg", reps: 8 },
        ],
        tags: ["Volume"],
      },
      {
        id: "e2",
        name: "Leg Extensions",
        equipment: "Machine",
        sets: [
          {
            id: "s4",
            setNumber: 1,
            weight: 40,
            weightUnit: "kg",
            reps: 15,
            restSeconds: 60,
          },
          {
            id: "s5",
            setNumber: 2,
            weight: 45,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 60,
          },
          { id: "s6", setNumber: 3, weight: 45, weightUnit: "kg", reps: 10 },
        ],
      },
      {
        id: "e3",
        name: "Flat Leg Raises",
        equipment: "Bodyweight",
        sets: [
          {
            id: "s7",
            setNumber: 1,
            weight: 0,
            weightUnit: "kg",
            reps: 20,
            restSeconds: 45,
          },
          {
            id: "s8",
            setNumber: 2,
            weight: 0,
            weightUnit: "kg",
            reps: 18,
            restSeconds: 45,
          },
          { id: "s9", setNumber: 3, weight: 0, weightUnit: "kg", reps: 15 },
        ],
      },
      {
        id: "e4",
        name: "Standing Calf Raises",
        equipment: "Machine",
        sets: [
          {
            id: "s10",
            setNumber: 1,
            weight: 60,
            weightUnit: "kg",
            reps: 20,
            restSeconds: 45,
          },
          {
            id: "s11",
            setNumber: 2,
            weight: 65,
            weightUnit: "kg",
            reps: 18,
            restSeconds: 45,
          },
          { id: "s12", setNumber: 3, weight: 65, weightUnit: "kg", reps: 15 },
        ],
      },
      {
        id: "e5",
        name: "Bulgarian Split Squats",
        equipment: "Dumbbell",
        sets: [
          {
            id: "s13",
            setNumber: 1,
            weight: 24,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 60,
          },
          {
            id: "s14",
            setNumber: 2,
            weight: 24,
            weightUnit: "kg",
            reps: 10,
            restSeconds: 60,
          },
          { id: "s15", setNumber: 3, weight: 24, weightUnit: "kg", reps: 8 },
        ],
        tags: ["Weight"],
      },
    ],
    stats: {
      workingSets: 22,
      duration: "1:01:43",
      estCalories: 356,
      totalWeight: 986,
      totalWeightUnit: "kg",
      prs: 8,
    },
  },
  {
    id: "2",
    title: "Push Day",
    date: "2024-01-01T14:00:00Z",
    type: "Tracked Workout",
    description:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.",
    exerciseNames: [
      "Squats",
      "Leg Extensions",
      "Flat Leg Raises",
      "Standing Calf Raises",
      "Bulgarian Split Squats",
    ],
    exercises: [
      {
        id: "e6",
        name: "Deadlift",
        equipment: "Barbell",
        sets: [
          {
            id: "s16",
            setNumber: 1,
            weight: 24,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 390,
          },
          {
            id: "s17",
            setNumber: 2,
            weight: 28,
            weightUnit: "kg",
            reps: 10,
            restSeconds: 300,
          },
        ],
        tags: ["Volume", "1RM"],
      },
      {
        id: "e7",
        name: "Bulgarian Split Squats",
        equipment: "Dumbbell",
        sets: [
          { id: "s18", setNumber: 1, weight: 24, weightUnit: "kg", reps: 12 },
          { id: "s19", setNumber: 2, weight: 24, weightUnit: "kg", reps: 10 },
          { id: "s20", setNumber: 3, weight: 24, weightUnit: "kg", reps: 8 },
        ],
        tags: ["Weight"],
      },
      {
        id: "e8",
        name: "Hamstring Curls",
        equipment: "Machine",
        sets: [
          {
            id: "s21",
            setNumber: 1,
            weight: 30,
            weightUnit: "kg",
            reps: 15,
            restSeconds: 60,
          },
          {
            id: "s22",
            setNumber: 2,
            weight: 35,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 60,
          },
          { id: "s23", setNumber: 3, weight: 35, weightUnit: "kg", reps: 10 },
        ],
      },
    ],
    stats: {
      workingSets: 32,
      duration: "2:06:14",
      estCalories: 612,
      totalWeight: 1248,
      totalWeightUnit: "kg",
      prs: 12,
    },
  },
  {
    id: "3",
    title: "Pull Day",
    date: "2023-12-31T09:00:00Z",
    type: "Routine",
    description:
      "Back and biceps focused workout with emphasis on compound movements and progressive overload.",
    exerciseNames: [
      "Deadlift",
      "Barbell Rows",
      "Lat Pulldowns",
      "Face Pulls",
      "Barbell Curls",
    ],
    exercises: [
      {
        id: "e9",
        name: "Deadlift",
        equipment: "Barbell",
        sets: [
          {
            id: "s24",
            setNumber: 1,
            weight: 100,
            weightUnit: "kg",
            reps: 8,
            restSeconds: 120,
          },
          {
            id: "s25",
            setNumber: 2,
            weight: 110,
            weightUnit: "kg",
            reps: 6,
            restSeconds: 120,
          },
          { id: "s26", setNumber: 3, weight: 115, weightUnit: "kg", reps: 5 },
        ],
        tags: ["Volume", "1RM"],
      },
      {
        id: "e10",
        name: "Barbell Rows",
        equipment: "Barbell",
        sets: [
          {
            id: "s27",
            setNumber: 1,
            weight: 60,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 90,
          },
          {
            id: "s28",
            setNumber: 2,
            weight: 65,
            weightUnit: "kg",
            reps: 10,
            restSeconds: 90,
          },
          { id: "s29", setNumber: 3, weight: 65, weightUnit: "kg", reps: 8 },
        ],
      },
      {
        id: "e11",
        name: "Lat Pulldowns",
        equipment: "Machine",
        sets: [
          {
            id: "s30",
            setNumber: 1,
            weight: 50,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 60,
          },
          {
            id: "s31",
            setNumber: 2,
            weight: 55,
            weightUnit: "kg",
            reps: 10,
            restSeconds: 60,
          },
          { id: "s32", setNumber: 3, weight: 55, weightUnit: "kg", reps: 8 },
        ],
      },
      {
        id: "e12",
        name: "Barbell Curls",
        equipment: "Barbell",
        sets: [
          {
            id: "s33",
            setNumber: 1,
            weight: 20,
            weightUnit: "kg",
            reps: 12,
            restSeconds: 60,
          },
          { id: "s34", setNumber: 2, weight: 22, weightUnit: "kg", reps: 10 },
        ],
      },
    ],
    stats: {
      workingSets: 18,
      duration: "1:15:22",
      estCalories: 420,
      totalWeight: 1520,
      totalWeightUnit: "kg",
      prs: 5,
    },
  },
];
