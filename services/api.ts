import { getClerkInstance } from "@clerk/expo";
// import { Platform } from "react-native";

// Point to your Next.js backend.
// For local dev on a physical device, use your machine's LAN IP.
// For iOS Simulator, localhost works. For Android emulator, use 10.0.2.2.
// const getDevBaseUrl = () => {
//   if (Platform.OS === "android") {
//     // Android emulator maps 10.0.2.2 to host machine's localhost
//     return "http://10.0.2.2:3000/api/v1";
//   }
//   // iOS: use the env var if set, otherwise fall back to LAN IP
//   // Update this IP when your network changes
//   const lanIp =
//     process.env.EXPO_PUBLIC_API_URL || "http://192.168.178.157:3000/api/v1";
//   return lanIp;
// };

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "";

export { API_BASE_URL };

/**
 * Get the Clerk session token using the official Clerk instance.
 * This is the recommended way to access the token outside React components.
 *
 * Retries up to 3 times with a 1-second delay if the session/token is not
 * yet available (e.g. right after app cold-start or foregrounding).
 */
async function getToken(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const clerk = getClerkInstance();
      const token = await clerk.session?.getToken();
      if (token) return token;
    } catch {
      // ignore
    }
    // Wait 1s before retrying (only if we'll retry)
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.warn("[API] getToken: no token after 3 attempts");
  return null;
}

/**
 * Authenticated fetch wrapper.
 * Automatically attaches the Clerk JWT as a Bearer token.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
}

// ─── Auth ────────────────────────────────────────────

export async function syncUser(data: {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
}) {
  const res = await fetch(`${API_BASE_URL}/auth/sync-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res;
}

// ─── User Profile ────────────────────────────────────

export async function getMe() {
  return apiFetch("/users/me");
}

export async function updateMe(data: {
  name?: string;
  firstName?: string;
  lastName?: string;
  preferences?: { weightUnit?: string; distanceUnit?: string };
  profile?: {
    heightCm?: number | null;
    weightKg?: number | null;
    age?: number | null;
    gender?: string | null;
    goalType?: string | null;
    targetWeightKg?: number | null;
    weeklyWeightChange?: number | null;
    dailyCalorieGoal?: number | null;
    dailyProteinGoal?: number | null;
  };
  connectedApps?: {
    appleHealth?: { connected: boolean };
    myFitnessPal?: { connected: boolean };
  };
}) {
  return apiFetch("/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Exercises ───────────────────────────────────────

export async function getExercises(params?: {
  category?: string;
  equipment?: string;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.equipment) query.set("equipment", params.equipment);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiFetch(`/exercises${qs ? `?${qs}` : ""}`);
}

export async function createExercise(data: {
  name: string;
  equipment: string;
  category: string;
  musclesWorked?: string[];
}) {
  return apiFetch("/exercises", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Routines ────────────────────────────────────────

export async function getRoutines() {
  return apiFetch("/routines");
}

export async function getRoutine(id: string) {
  return apiFetch(`/routines/${id}`);
}

export async function getActiveRoutine() {
  return apiFetch("/routines/active");
}

export async function createRoutine(data: Record<string, unknown>) {
  return apiFetch("/routines", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRoutine(id: string, data: Record<string, unknown>) {
  return apiFetch(`/routines/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function patchRoutine(id: string, data: Record<string, unknown>) {
  return apiFetch(`/routines/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteRoutine(id: string) {
  return apiFetch(`/routines/${id}`, { method: "DELETE" });
}

export async function setRoutineActive(id: string, active: boolean) {
  return apiFetch(`/routines/${id}/active`, {
    method: "PUT",
    body: JSON.stringify({ active }),
  });
}

// ─── Workouts ────────────────────────────────────────

export async function getWorkouts(params?: {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return apiFetch(`/workouts${qs ? `?${qs}` : ""}`);
}

export async function getWorkout(id: string) {
  return apiFetch(`/workouts/${id}`);
}

export async function createWorkout(data: Record<string, unknown>) {
  return apiFetch("/workouts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateWorkout(id: string, data: Record<string, unknown>) {
  return apiFetch(`/workouts/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteWorkout(id: string) {
  return apiFetch(`/workouts/${id}`, { method: "DELETE" });
}

export async function getPreviousWorkoutData(
  exercises: { name: string; equipment: string }[],
) {
  return apiFetch("/workouts/previous", {
    method: "POST",
    body: JSON.stringify({ exercises }),
  });
}

// ─── Stats ───────────────────────────────────────────

export async function getStatsSummary(period?: string) {
  const qs = period ? `?period=${period}` : "";
  return apiFetch(`/stats/summary${qs}`);
}

export async function getExerciseStats(exerciseId: string) {
  return apiFetch(`/stats/exercise/${exerciseId}`);
}

export async function getVolumeStats(params?: {
  period?: string;
  muscleGroup?: string;
}) {
  const query = new URLSearchParams();
  if (params?.period) query.set("period", params.period);
  if (params?.muscleGroup) query.set("muscleGroup", params.muscleGroup);
  const qs = query.toString();
  return apiFetch(`/stats/volume${qs ? `?${qs}` : ""}`);
}

export async function getProgression(weeks?: number) {
  const qs = weeks ? `?weeks=${weeks}` : "";
  return apiFetch(`/stats/progression${qs}`);
}

export async function getPlateaus() {
  return apiFetch("/stats/plateaus");
}

// ─── Health Data ─────────────────────────────────────

export async function syncHealthData(entries: Record<string, unknown>[]) {
  return apiFetch("/health-data/sync", {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
}

export async function getHealthData(params?: {
  from?: string;
  to?: string;
  source?: string;
}) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.source) query.set("source", params.source);
  const qs = query.toString();
  return apiFetch(`/health-data/sync${qs ? `?${qs}` : ""}`);
}

export async function getDeficitData(params?: {
  period?: string;
  from?: string;
  to?: string;
}) {
  const query = new URLSearchParams();
  if (params?.period) query.set("period", params.period);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return apiFetch(`/health-data/deficit${qs ? `?${qs}` : ""}`);
}
