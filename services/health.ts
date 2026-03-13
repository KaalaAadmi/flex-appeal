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
import { syncHealthData } from "./api";

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
  dietaryEnergy:
    "HKQuantityTypeIdentifierDietaryEnergyConsumed" as QuantityTypeIdentifier,
  protein: "HKQuantityTypeIdentifierDietaryProtein" as QuantityTypeIdentifier,
  carbs:
    "HKQuantityTypeIdentifierDietaryCarbohydrates" as QuantityTypeIdentifier,
  fat: "HKQuantityTypeIdentifierDietaryFatTotal" as QuantityTypeIdentifier,
  distance:
    "HKQuantityTypeIdentifierDistanceWalkingRunning" as QuantityTypeIdentifier,
} as const;

const READ_TYPES = Object.values(QTY) as readonly QuantityTypeIdentifier[];

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
