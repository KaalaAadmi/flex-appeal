/**
 * Apple Health (HealthKit) integration service.
 *
 * Uses @kingstinct/react-native-healthkit to read:
 * - Active energy burned (calories)
 * - Basal energy burned (resting calories)
 * - Step count
 * - Body mass (weight)
 * - Dietary energy consumed (from MyFitnessPal via HealthKit)
 * - Dietary protein, carbs, fat
 *
 * NOTE: This module will only work on iOS with a dev build (not Expo Go).
 * On Android/web or Expo Go, all methods return empty data gracefully.
 *
 * The library uses NitroModules which crash if imported at the top level
 * inside Expo Go, so we lazy-load via a getter that catches the error.
 */

import { Platform } from "react-native";
import { syncHealthData, getMe, updateMe } from "./api";
import * as SecureStore from "expo-secure-store";

// We import only the *type* at the top level (zero runtime cost).
import type { QuantityTypeIdentifier } from "@kingstinct/react-native-healthkit";

/**
 * Lazy-loaded reference to the HealthKit module.
 * `undefined` = not yet attempted; `null` = attempted but failed (Expo Go / Android).
 */
let _hk: typeof import("@kingstinct/react-native-healthkit") | null | undefined;

function getHK(): typeof import("@kingstinct/react-native-healthkit") | null {
  if (_hk !== undefined)
    return _hk as typeof import("@kingstinct/react-native-healthkit") | null; // already resolved (or null)

  if (Platform.OS !== "ios") {
    _hk = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _hk = require("@kingstinct/react-native-healthkit");
    return _hk as typeof import("@kingstinct/react-native-healthkit");
  } catch (e) {
    console.warn(
      "[HealthService] Could not load @kingstinct/react-native-healthkit " +
        "(expected in Expo Go — use a dev build instead):",
      e,
    );
    _hk = null;
    return null;
  }
}

/** HealthKit quantity type identifiers we care about */
const QTY = {
  activeEnergy:
    "HKQuantityTypeIdentifierActiveEnergyBurned" as QuantityTypeIdentifier,
  basalEnergy:
    "HKQuantityTypeIdentifierBasalEnergyBurned" as QuantityTypeIdentifier,
  steps: "HKQuantityTypeIdentifierStepCount" as QuantityTypeIdentifier,
  bodyMass: "HKQuantityTypeIdentifierBodyMass" as QuantityTypeIdentifier,
  height: "HKQuantityTypeIdentifierHeight" as QuantityTypeIdentifier,
  dietaryEnergy:
    "HKQuantityTypeIdentifierDietaryEnergyConsumed" as QuantityTypeIdentifier,
  protein: "HKQuantityTypeIdentifierDietaryProtein" as QuantityTypeIdentifier,
  carbs:
    "HKQuantityTypeIdentifierDietaryCarbohydrates" as QuantityTypeIdentifier,
  fat: "HKQuantityTypeIdentifierDietaryFatTotal" as QuantityTypeIdentifier,
  distance:
    "HKQuantityTypeIdentifierDistanceWalkingRunning" as QuantityTypeIdentifier,
} as const;

/** Characteristic types (date of birth, biological sex) */
const CHAR_TYPES = [
  "HKCharacteristicTypeIdentifierDateOfBirth",
  "HKCharacteristicTypeIdentifierBiologicalSex",
] as const;

const READ_TYPES = [
  ...Object.values(QTY),
  ...CHAR_TYPES,
] as readonly string[] as readonly QuantityTypeIdentifier[];

/**
 * Initialize HealthKit and request permissions.
 * Returns true if successful, false otherwise.
 */
export async function initializeHealthKit(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  const HK = getHK();
  if (!HK) return false;

  try {
    const isAvailable = HK.isHealthDataAvailable();
    if (!isAvailable) return false;

    await HK.requestAuthorization({ toRead: READ_TYPES });
    return true;
  } catch (err) {
    console.warn("[HealthKit] Init error:", err);
    return false;
  }
}

/**
 * Check if HealthKit is available on this device.
 */
export function isHealthKitAvailable(): boolean {
  if (Platform.OS !== "ios") return false;

  const HK = getHK();
  if (!HK) return false;

  try {
    return HK.isHealthDataAvailable();
  } catch {
    return false;
  }
}

/**
 * Returns a reason string if HealthKit is NOT available:
 *  - "not_ios"           → Android / web
 *  - "no_native_module"  → iOS but NitroModule missing (running in Expo Go)
 *  - "device_unavailable"→ iOS device that doesn't support HealthKit (e.g. iPad)
 *  - null                → HealthKit IS available
 */
export function healthKitUnavailableReason(): string | null {
  if (Platform.OS !== "ios") return "not_ios";

  const HK = getHK();
  if (!HK) return "no_native_module";

  try {
    if (!HK.isHealthDataAvailable()) return "device_unavailable";
  } catch {
    return "device_unavailable";
  }

  return null;
}

/**
 * Fetch health data for a given date range and sync to backend.
 */
export async function fetchAndSyncHealthData(
  daysBack: number = 7,
): Promise<{ synced: number }> {
  if (Platform.OS !== "ios") return { synced: 0 };

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  try {
    // Fetch all data in parallel
    const [
      activeEnergy,
      basalEnergy,
      steps,
      dietaryEnergy,
      protein,
      carbs,
      fat,
      bodyWeight,
    ] = await Promise.all([
      querySamples(QTY.activeEnergy, startDate, endDate),
      querySamples(QTY.basalEnergy, startDate, endDate),
      querySamples(QTY.steps, startDate, endDate),
      querySamples(QTY.dietaryEnergy, startDate, endDate),
      querySamples(QTY.protein, startDate, endDate),
      querySamples(QTY.carbs, startDate, endDate),
      querySamples(QTY.fat, startDate, endDate),
      querySamples(QTY.bodyMass, startDate, endDate),
    ]);

    // Group all data by date
    const dateMap: Record<string, Record<string, number>> = {};

    const addToDate = (
      samples: { startDate: string; quantity: number }[],
      field: string,
      aggregate: "sum" | "latest" = "sum",
    ) => {
      for (const sample of samples) {
        const date = (sample.startDate || "").split("T")[0];
        if (!date) continue;
        if (!dateMap[date]) dateMap[date] = {};

        if (aggregate === "sum") {
          dateMap[date][field] =
            (dateMap[date][field] || 0) + (sample.quantity || 0);
        } else {
          dateMap[date][field] = sample.quantity || 0;
        }
      }
    };

    addToDate(activeEnergy, "activeCaloriesBurned", "sum");
    addToDate(basalEnergy, "basalCaloriesBurned", "sum");
    addToDate(steps, "stepCount", "sum");
    addToDate(dietaryEnergy, "caloriesConsumed", "sum");
    addToDate(protein, "proteinGrams", "sum");
    addToDate(carbs, "carbsGrams", "sum");
    addToDate(fat, "fatGrams", "sum");
    addToDate(bodyWeight, "bodyWeightKg", "latest");

    // Build entries for our API
    const entries = Object.entries(dateMap).map(([date, values]) => ({
      date,
      source: "apple_health",
      caloriesBurned:
        (values.activeCaloriesBurned || 0) + (values.basalCaloriesBurned || 0),
      activeCaloriesBurned: values.activeCaloriesBurned || 0,
      basalCaloriesBurned: values.basalCaloriesBurned || 0,
      caloriesConsumed: values.caloriesConsumed || undefined,
      stepCount: values.stepCount || 0,
      proteinGrams: values.proteinGrams || undefined,
      carbsGrams: values.carbsGrams || undefined,
      fatGrams: values.fatGrams || undefined,
      bodyWeightKg: values.bodyWeightKg || undefined,
    }));

    if (entries.length === 0) return { synced: 0 };

    // Sync to backend
    const res = await syncHealthData(entries);
    if (res.ok) {
      const json = await res.json();
      return { synced: json.synced || entries.length };
    }

    return { synced: 0 };
  } catch (error) {
    console.warn("[HealthKit] Sync error:", error);
    return { synced: 0 };
  }
}

/**
 * Helper: query quantity samples from HealthKit.
 */
async function querySamples(
  identifier: QuantityTypeIdentifier,
  from: Date,
  to: Date,
): Promise<{ startDate: string; quantity: number }[]> {
  const HK = getHK();
  if (!HK) return [];

  try {
    const samples = await HK.queryQuantitySamples(identifier, {
      ascending: true,
      limit: 0, // 0 or negative = fetch all
      filter: {
        date: {
          startDate: from,
          endDate: to,
        },
      },
    });
    return samples.map((s: { startDate: string | Date; quantity: number }) => ({
      startDate:
        typeof s.startDate === "string"
          ? s.startDate
          : new Date(s.startDate).toISOString(),
      quantity: s.quantity,
    }));
  } catch (err) {
    console.warn(`[HealthKit] ${identifier} query error:`, err);
    return [];
  }
}

/**
 * Query Apple Health for active energy burned during a specific time window.
 * Useful for getting the calorie count for a workout session.
 *
 * @param startTime - When the workout started
 * @param endTime   - When the workout ended
 * @returns Total active calories burned during the window, or null if unavailable
 */
export async function getActiveCaloriesForPeriod(
  startTime: Date,
  endTime: Date,
): Promise<number | null> {
  if (Platform.OS !== "ios") return null;

  const HK = getHK();
  if (!HK) return null;

  try {
    const samples = await querySamples(QTY.activeEnergy, startTime, endTime);
    if (samples.length === 0) return null;

    const total = samples.reduce((sum, s) => sum + (s.quantity || 0), 0);
    return Math.round(total);
  } catch (err) {
    console.warn("[HealthKit] getActiveCaloriesForPeriod error:", err);
    return null;
  }
}

/**
 * Get the cumulative active calories burned today up to this moment.
 *
 * The idea: call this at workout start, call it again at workout end,
 * and the difference is the active calories burned during the workout.
 * This is more accurate than querying samples within a time range because
 * it avoids issues with sample batching at the boundaries.
 *
 * @returns Total active calories burned today so far, or null if unavailable
 */
export async function getCumulativeActiveCalories(): Promise<number | null> {
  if (Platform.OS !== "ios") return null;

  const HK = getHK();
  if (!HK) return null;

  try {
    // Query from midnight today to now
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const samples = await querySamples(QTY.activeEnergy, startOfDay, now);
    if (samples.length === 0) return 0;

    const total = samples.reduce((sum, s) => sum + (s.quantity || 0), 0);
    return Math.round(total);
  } catch (err) {
    console.warn("[HealthKit] getCumulativeActiveCalories error:", err);
    return null;
  }
}

// ─── User Details Sync from HealthKit ────────────────

const HEALTH_DETAILS_SYNC_KEY = "healthkit_details_last_sync";

interface HealthKitUserDetails {
  heightCm?: number | null;
  weightKg?: number | null;
  age?: number | null;
  gender?: string | null;
}

/**
 * Map HealthKit BiologicalSex enum to our gender string.
 * BiologicalSex: notSet=0, female=1, male=2, other=3
 */
function biologicalSexToGender(sex: number): string | null {
  switch (sex) {
    case 1:
      return "Female";
    case 2:
      return "Male";
    case 3:
      return "Other";
    default:
      return null; // notSet
  }
}

/**
 * Read user characteristics & most-recent body measurements from HealthKit.
 * Returns height (cm), weight (kg), age (computed from DOB), and gender.
 */
export async function getUserDetailsFromHealthKit(): Promise<HealthKitUserDetails> {
  if (Platform.OS !== "ios") return {};

  const HK = getHK();
  if (!HK) return {};

  const details: HealthKitUserDetails = {};

  try {
    // Biological Sex
    const sex = await HK.getBiologicalSex();
    details.gender = biologicalSexToGender(sex);
  } catch {
    /* user may not have granted this permission */
  }

  try {
    // Date of Birth → age
    const dob = await HK.getDateOfBirth();
    if (dob) {
      const birthDate = new Date(dob);
      const today = new Date();
      let ageYears = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        ageYears--;
      }
      if (ageYears > 0 && ageYears < 150) {
        details.age = ageYears;
      }
    }
  } catch {
    /* user may not have set DOB */
  }

  try {
    // Height (most recent sample, in meters → convert to cm)
    const heightSample = await HK.getMostRecentQuantitySample(QTY.height);
    if (heightSample && heightSample.quantity > 0) {
      // HealthKit returns height in meters by default
      details.heightCm = Math.round(heightSample.quantity * 100);
    }
  } catch {
    /* no height data */
  }

  try {
    // Body Mass (most recent sample, in kg)
    const weightSample = await HK.getMostRecentQuantitySample(QTY.bodyMass);
    if (weightSample && weightSample.quantity > 0) {
      details.weightKg = Math.round(weightSample.quantity * 10) / 10;
    }
  } catch {
    /* no weight data */
  }

  return details;
}

/**
 * Sync user details from HealthKit to the backend profile.
 * Only updates fields that have changed (non-null HealthKit values override blanks;
 * non-null HealthKit values also override existing DB values if different).
 *
 * Returns true if an update was sent, false if nothing changed.
 */
export async function syncUserDetailsFromHealthKit(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  try {
    const hkDetails = await getUserDetailsFromHealthKit();

    // Nothing came back from HealthKit
    const hasAny =
      hkDetails.heightCm != null ||
      hkDetails.weightKg != null ||
      hkDetails.age != null ||
      hkDetails.gender != null;
    if (!hasAny) return false;

    // Fetch current profile from backend
    const res = await getMe();
    if (!res.ok) return false;
    const userData = await res.json();
    const profile = userData.profile || {};

    // Build update payload — only include fields that actually changed
    const profileUpdate: Record<string, unknown> = {};
    let changed = false;

    if (hkDetails.heightCm != null && hkDetails.heightCm !== profile.heightCm) {
      profileUpdate.heightCm = hkDetails.heightCm;
      changed = true;
    }
    if (hkDetails.weightKg != null && hkDetails.weightKg !== profile.weightKg) {
      profileUpdate.weightKg = hkDetails.weightKg;
      changed = true;
    }
    if (hkDetails.age != null && hkDetails.age !== profile.age) {
      profileUpdate.age = hkDetails.age;
      changed = true;
    }
    if (hkDetails.gender != null && hkDetails.gender !== profile.gender) {
      profileUpdate.gender = hkDetails.gender;
      changed = true;
    }

    if (!changed) return false;

    // Send PATCH to backend
    const updateRes = await updateMe({ profile: profileUpdate });
    if (updateRes.ok) {
      console.log(
        "[HealthKit] User details synced:",
        JSON.stringify(profileUpdate),
      );
    }
    return updateRes.ok;
  } catch (err) {
    console.warn("[HealthKit] syncUserDetailsFromHealthKit error:", err);
    return false;
  }
}

/**
 * Check if a daily sync of user details is due, and perform it if so.
 * Stores the last sync date in SecureStore so it runs at most once per day.
 * Also runs on first launch (no stored date).
 */
export async function maybeSyncUserDetailsDaily(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    const lastSync = await SecureStore.getItemAsync(HEALTH_DETAILS_SYNC_KEY);

    if (lastSync === todayStr) return; // already synced today

    const didSync = await syncUserDetailsFromHealthKit();
    if (didSync) {
      await SecureStore.setItemAsync(HEALTH_DETAILS_SYNC_KEY, todayStr);
      console.log("[HealthKit] Daily user details sync complete for", todayStr);
    } else {
      // Even if nothing changed, mark as synced so we don't retry every focus
      await SecureStore.setItemAsync(HEALTH_DETAILS_SYNC_KEY, todayStr);
    }
  } catch (err) {
    console.warn("[HealthKit] maybeSyncUserDetailsDaily error:", err);
  }
}

// ─── App-open Health Data Sync ───────────────────────

const HEALTH_DATA_SYNC_KEY = "healthkit_data_last_sync";

/**
 * Sync recent health data (last 14 days) from HealthKit to the backend
 * every time the app is opened, but throttle to at most once per 5 minutes
 * to avoid hammering the API on rapid tab switches.
 */
export async function syncHealthDataOnAppOpen(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    const now = Date.now();
    const lastSync = await SecureStore.getItemAsync(HEALTH_DATA_SYNC_KEY);
    const lastSyncMs = lastSync ? parseInt(lastSync, 10) : 0;

    // Throttle: skip if synced less than 5 min ago
    if (now - lastSyncMs < 5 * 60 * 1000) return;

    // Check if Apple Health was ever connected by seeing if the HK module loads
    const HK = getHK();
    if (!HK) return;

    console.log("[HealthKit] App-open sync: fetching last 14 days…");
    const result = await fetchAndSyncHealthData(14);
    console.log("[HealthKit] App-open sync complete:", result.synced, "days");

    await SecureStore.setItemAsync(HEALTH_DATA_SYNC_KEY, String(now));
  } catch (err) {
    console.warn("[HealthKit] syncHealthDataOnAppOpen error:", err);
  }
}

// ─── Background Fetch Task ──────────────────────────

export const BACKGROUND_HEALTH_SYNC_TASK = "background-health-sync";

/**
 * The function that runs as a background fetch task.
 * Syncs the last 2 days of health data + user details.
 * Returns BackgroundFetch result codes (use the constants from the caller).
 */
export async function runBackgroundHealthSync(): Promise<number> {
  if (Platform.OS !== "ios") return 3; // BackgroundFetch.BackgroundFetchResult.NoData

  try {
    const HK = getHK();
    if (!HK) return 3; // NoData

    console.log("[HealthKit] Background sync: fetching last 2 days…");
    const result = await fetchAndSyncHealthData(2);

    // Also sync user details
    await syncUserDetailsFromHealthKit();

    console.log("[HealthKit] Background sync complete:", result.synced, "days");

    // Store timestamp
    await SecureStore.setItemAsync(HEALTH_DATA_SYNC_KEY, String(Date.now()));

    return result.synced > 0 ? 2 : 3; // NewData : NoData
  } catch (err) {
    console.warn("[HealthKit] Background sync error:", err);
    return 1; // Failed
  }
}
