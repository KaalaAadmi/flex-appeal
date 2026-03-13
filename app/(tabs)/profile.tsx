import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useCallback } from "react";
import { useUser, useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { getMe, updateMe } from "@/services/api";
import {
  initializeHealthKit,
  healthKitUnavailableReason,
  fetchAndSyncHealthData,
} from "@/services/health";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const INPUT_BG = "#1E1E1E";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const BORDER_COLOR = "#333";
const GREEN = "#2ECC71";
const RED = "#E74C3C";

const GOAL_TYPES = [
  { id: "cut", label: "Cut (Lose Fat)", icon: "trending-down" as const },
  { id: "maintain", label: "Maintain", icon: "trending-flat" as const },
  { id: "bulk", label: "Bulk (Gain Muscle)", icon: "trending-up" as const },
];

const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];

/** Weekly weight-change rate options (kg/week). Positive = gain, negative = lose. */
const WEEKLY_RATE_OPTIONS = [
  { value: -0.25, label: "0.25 kg/wk" },
  { value: -0.5, label: "0.5 kg/wk" },
  { value: -0.75, label: "0.75 kg/wk" },
  { value: -1.0, label: "1 kg/wk" },
];
const WEEKLY_BULK_OPTIONS = [
  { value: 0.25, label: "0.25 kg/wk" },
  { value: 0.5, label: "0.5 kg/wk" },
];

/**
 * Harris-Benedict formula to estimate BMR, then calculate TDEE + goal-adjusted targets.
 *
 * BMR (Male)   = 88.362  + (13.397 × weight_kg) + (4.799 × height_cm) − (5.677 × age)
 * BMR (Female) = 447.593 + (9.247  × weight_kg) + (3.098 × height_cm) − (4.330 × age)
 *
 * TDEE = BMR × activity_factor  (we default to 1.55 = moderately active)
 *
 * 1 kg of body fat ≈ 7 700 kcal.
 * Daily deficit/surplus = weeklyRate × 7700 / 7
 *
 * Protein (g/day based on body weight):
 *   cut      → 2.2 g/kg
 *   maintain → 1.8 g/kg
 *   bulk     → 2.0 g/kg
 */
function calculateGoals(
  heightCmVal: number,
  weightKgVal: number,
  ageVal: number,
  genderVal: string,
  goalTypeVal: string,
  weeklyRate: number, // kg/week — negative for cut, positive for bulk
): { calories: number; protein: number } | null {
  if (!heightCmVal || !weightKgVal || !ageVal || !genderVal || !goalTypeVal)
    return null;

  let bmr: number;
  if (genderVal === "Female") {
    bmr = 447.593 + 9.247 * weightKgVal + 3.098 * heightCmVal - 4.33 * ageVal;
  } else {
    // Male / Other / Prefer not to say → use male formula as default
    bmr = 88.362 + 13.397 * weightKgVal + 4.799 * heightCmVal - 5.677 * ageVal;
  }

  // Moderately active multiplier
  const tdee = bmr * 1.55;

  let calories: number;
  let proteinPerKg: number;

  if (goalTypeVal === "cut") {
    // weeklyRate is negative, e.g. -0.5 → daily deficit = 0.5 * 7700 / 7 = 550
    const dailyDeficit = (Math.abs(weeklyRate) * 7700) / 7;
    calories = tdee - dailyDeficit;
    proteinPerKg = 2.2;
  } else if (goalTypeVal === "bulk") {
    const dailySurplus = (Math.abs(weeklyRate) * 7700) / 7;
    calories = tdee + dailySurplus;
    proteinPerKg = 2.0;
  } else {
    // maintain
    calories = tdee;
    proteinPerKg = 1.8;
  }

  return {
    calories: Math.round(calories),
    protein: Math.round(proteinPerKg * weightKgVal),
  };
}

interface UserProfile {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  preferences: { weightUnit: string; distanceUnit: string };
  profile: {
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
  connectedApps: {
    appleHealth: { connected: boolean; lastSyncAt?: string | null };
    myFitnessPal: { connected: boolean; lastSyncAt?: string | null };
  };
}

export default function ProfileScreen() {
  const { user: clerkUser } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // Profile state
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [distanceUnit, setDistanceUnit] = useState("km");

  // Body & goals
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [goalType, setGoalType] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState("");
  const [dailyProteinGoal, setDailyProteinGoal] = useState("");
  const [weeklyWeightChange, setWeeklyWeightChange] = useState(-0.5); // kg/week default

  // Connected apps
  const [appleHealthConnected, setAppleHealthConnected] = useState(false);
  const [mfpConnected, setMfpConnected] = useState(false);

  // Whether calorie/protein goals were manually typed (prevents auto-overwrite)
  const [goalsManuallySet, setGoalsManuallySet] = useState(false);

  /** Run Harris-Benedict and fill calorie/protein goals */
  const autoCalculateGoals = useCallback(() => {
    const h = heightCm ? parseFloat(heightCm) : 0;
    const w = weightKg ? parseFloat(weightKg) : 0;
    const a = age ? parseInt(age) : 0;
    const result = calculateGoals(
      h,
      w,
      a,
      gender,
      goalType,
      weeklyWeightChange,
    );
    if (result) {
      setDailyCalorieGoal(String(result.calories));
      setDailyProteinGoal(String(result.protein));
      setGoalsManuallySet(false);
    }
  }, [heightCm, weightKg, age, gender, goalType, weeklyWeightChange]);

  const populateFromData = useCallback((data: UserProfile) => {
    setName(data.name || "");
    setFirstName(data.firstName || "");
    setLastName(data.lastName || "");
    setEmail(data.email || "");
    setWeightUnit(data.preferences?.weightUnit || "kg");
    setDistanceUnit(data.preferences?.distanceUnit || "km");

    const p = data.profile || {};
    setHeightCm(p.heightCm ? String(p.heightCm) : "");
    setWeightKg(p.weightKg ? String(p.weightKg) : "");
    setAge(p.age ? String(p.age) : "");
    setGender(p.gender || "");
    setGoalType(p.goalType || "");
    setTargetWeightKg(p.targetWeightKg ? String(p.targetWeightKg) : "");
    setWeeklyWeightChange(p.weeklyWeightChange ?? -0.5);
    setDailyCalorieGoal(p.dailyCalorieGoal ? String(p.dailyCalorieGoal) : "");
    setDailyProteinGoal(p.dailyProteinGoal ? String(p.dailyProteinGoal) : "");

    const ca = data.connectedApps || {
      appleHealth: { connected: false },
      myFitnessPal: { connected: false },
    };
    setAppleHealthConnected(ca.appleHealth?.connected ?? false);
    setMfpConnected(ca.myFitnessPal?.connected ?? false);
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMe();
      if (res.ok) {
        const data: UserProfile = await res.json();
        populateFromData(data);
      }
    } catch (err) {
      console.warn("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  }, [populateFromData]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile]),
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: `${firstName} ${lastName}`.trim() || name,
        firstName,
        lastName,
        preferences: {
          weightUnit,
          distanceUnit,
        },
        profile: {
          heightCm: heightCm ? parseFloat(heightCm) : null,
          weightKg: weightKg ? parseFloat(weightKg) : null,
          age: age ? parseInt(age) : null,
          gender: gender || null,
          goalType: goalType || null,
          targetWeightKg: targetWeightKg ? parseFloat(targetWeightKg) : null,
          weeklyWeightChange: weeklyWeightChange,
          dailyCalorieGoal: dailyCalorieGoal
            ? parseInt(dailyCalorieGoal)
            : null,
          dailyProteinGoal: dailyProteinGoal
            ? parseInt(dailyProteinGoal)
            : null,
        },
        connectedApps: {
          appleHealth: { connected: appleHealthConnected },
          myFitnessPal: { connected: mfpConnected },
        },
      };

      const res = await updateMe(payload);
      if (res.ok) {
        // Use the returned data to update local state immediately
        const updatedData: UserProfile = await res.json();
        populateFromData(updatedData);

        // Also update Clerk if name changed
        if (clerkUser) {
          try {
            await clerkUser.update({
              firstName,
              lastName,
            });
          } catch {
            // Non-critical: Clerk update failed but DB is updated
          }
        }
        setEditing(false);
        Alert.alert("Success", "Profile updated successfully.");
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Error", err.error?.message || "Failed to update profile.");
      }
    } catch {
      Alert.alert("Error", "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleConnectAppleHealth = () => {
    if (Platform.OS !== "ios") {
      Alert.alert(
        "Not Available",
        "Apple Health is only available on iOS devices.",
      );
      return;
    }

    if (appleHealthConnected) {
      // Disconnect flow
      Alert.alert(
        "Disconnect Apple Health",
        "This will stop syncing data from Apple Health.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: async () => {
              setAppleHealthConnected(false);
              // Persist disconnect to backend immediately
              try {
                await updateMe({
                  connectedApps: {
                    appleHealth: { connected: false },
                  },
                });
              } catch {
                // Revert on failure
                setAppleHealthConnected(true);
                Alert.alert("Error", "Failed to disconnect Apple Health.");
              }
            },
          },
        ],
      );
    } else {
      // Connect flow — actually initialize HealthKit
      Alert.alert(
        "Connect Apple Health",
        "This will allow the app to read your activity, calories burned, and body measurements from Apple Health.\n\nYou'll be asked to grant permissions.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Connect",
            onPress: async () => {
              try {
                const reason = healthKitUnavailableReason();
                if (reason === "not_ios") {
                  Alert.alert(
                    "Not Available",
                    "Apple Health is only available on iOS devices.",
                  );
                  return;
                }
                if (reason === "no_native_module") {
                  Alert.alert(
                    "Development Build Required",
                    "Apple Health integration requires an EAS Development Build. " +
                      "It cannot run in Expo Go.\n\n" +
                      "Run `eas build --profile development` or `npx expo run:ios` to create a dev build.",
                  );
                  return;
                }
                if (reason === "device_unavailable") {
                  Alert.alert(
                    "Not Available",
                    "HealthKit is not supported on this device.",
                  );
                  return;
                }

                const success = await initializeHealthKit();
                if (!success) {
                  Alert.alert(
                    "Permission Denied",
                    "Please enable Health access for Flex Appeal in Settings → Health → Data Access & Devices.",
                  );
                  return;
                }

                // Persist connection to backend immediately
                setAppleHealthConnected(true);
                const res = await updateMe({
                  connectedApps: {
                    appleHealth: { connected: true },
                  },
                });

                if (!res.ok) {
                  setAppleHealthConnected(false);
                  Alert.alert("Error", "Failed to save connection status.");
                  return;
                }

                // Do an initial sync of the last 30 days
                Alert.alert(
                  "Connected!",
                  "Apple Health is now connected. Syncing your data…",
                );
                const syncResult = await fetchAndSyncHealthData(30);
                if (syncResult.synced > 0) {
                  // Update lastSyncAt
                  await updateMe({
                    connectedApps: {
                      appleHealth: { connected: true },
                    },
                  });
                  Alert.alert(
                    "Sync Complete",
                    `Successfully synced ${syncResult.synced} day(s) of health data.`,
                  );
                }
              } catch (err) {
                console.warn("HealthKit connect error:", err);
                Alert.alert(
                  "Error",
                  "Failed to connect to Apple Health. Please try again.",
                );
              }
            },
          },
        ],
      );
    }
  };

  const handleConnectMFP = () => {
    if (mfpConnected) {
      // Disconnect flow
      Alert.alert(
        "Disconnect MyFitnessPal",
        "This will stop syncing nutrition data from MyFitnessPal.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: async () => {
              setMfpConnected(false);
              try {
                const res = await updateMe({
                  connectedApps: { myFitnessPal: { connected: false } },
                });
                if (!res.ok) {
                  setMfpConnected(true);
                  Alert.alert("Error", "Failed to update connection status.");
                }
              } catch {
                setMfpConnected(true);
                Alert.alert("Error", "Failed to update connection status.");
              }
            },
          },
        ],
      );
      return;
    }

    // Connect flow
    const needsHealthKit = !appleHealthConnected;
    Alert.alert(
      "Connect MyFitnessPal",
      "MyFitnessPal shares nutrition data (calories, protein, carbs, fat) via Apple Health.\n\n" +
        "To see your MFP data in Flex Appeal:\n" +
        "1. Open MyFitnessPal → Settings → Sharing & Privacy → Health App → enable all nutrition categories.\n" +
        (needsHealthKit
          ? "2. Then connect Apple Health above so Flex Appeal can read that data.\n"
          : "2. Apple Health is already connected ✅\n") +
        "3. Tap Connect below to mark it as linked.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Connect",
          onPress: async () => {
            setMfpConnected(true);
            try {
              const res = await updateMe({
                connectedApps: { myFitnessPal: { connected: true } },
              });
              if (!res.ok) {
                setMfpConnected(false);
                Alert.alert("Error", "Failed to update connection status.");
                return;
              }

              // If Apple Health is already connected, re-sync to pull any MFP nutrition data
              if (appleHealthConnected) {
                Alert.alert(
                  "Syncing…",
                  "Pulling nutrition data from Apple Health (including any MyFitnessPal entries).",
                );
                const syncResult = await fetchAndSyncHealthData(30);
                if (syncResult.synced > 0) {
                  Alert.alert(
                    "Sync Complete",
                    `Synced ${syncResult.synced} day(s) of data including nutrition.`,
                  );
                } else {
                  Alert.alert(
                    "No Data Found",
                    "No nutrition data was found in Apple Health yet. Make sure MyFitnessPal is syncing to Apple Health, then check back later.",
                  );
                }
              } else {
                Alert.alert(
                  "Almost There!",
                  "MyFitnessPal is marked as connected. Now connect Apple Health above so Flex Appeal can read the nutrition data MFP writes to Health.",
                );
              }
            } catch {
              setMfpConnected(false);
              Alert.alert("Error", "Failed to update connection status.");
            }
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator
          color={ORANGE}
          size="large"
          style={{ marginTop: 80 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.pageTitle}>Profile</Text>
          <TouchableOpacity
            style={s.editBtn}
            onPress={() => {
              if (editing) {
                handleSave();
              } else {
                setEditing(true);
              }
            }}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={ORANGE} size="small" />
            ) : (
              <>
                <MaterialIcons
                  name={editing ? "check" : "edit"}
                  size={18}
                  color={ORANGE}
                />
                <Text style={s.editBtnText}>{editing ? "Save" : "Edit"}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Avatar & Name */}
        <View style={s.avatarSection}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>
              {(firstName || name || "U").charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={s.userName}>{name || "User"}</Text>
          <Text style={s.userEmail}>{email}</Text>
        </View>

        {/* Personal Info Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Personal Information</Text>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>First Name</Text>
            {editing ? (
              <TextInput
                style={s.fieldInput}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor={SUBTLE_TEXT}
              />
            ) : (
              <Text style={s.fieldValue}>{firstName || "—"}</Text>
            )}
          </View>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Last Name</Text>
            {editing ? (
              <TextInput
                style={s.fieldInput}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor={SUBTLE_TEXT}
              />
            ) : (
              <Text style={s.fieldValue}>{lastName || "—"}</Text>
            )}
          </View>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Age</Text>
            {editing ? (
              <TextInput
                style={[s.fieldInput, { width: 80 }]}
                value={age}
                onChangeText={setAge}
                placeholder="25"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="numeric"
              />
            ) : (
              <Text style={s.fieldValue}>{age || "—"}</Text>
            )}
          </View>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Gender</Text>
            {editing ? (
              <View style={s.chipRow}>
                {GENDER_OPTIONS.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[s.chip, gender === g && s.chipActive]}
                    onPress={() => setGender(g)}
                  >
                    <Text
                      style={[s.chipText, gender === g && s.chipTextActive]}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={s.fieldValue}>{gender || "—"}</Text>
            )}
          </View>
        </View>

        {/* Body Measurements Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Body Measurements</Text>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Height (cm)</Text>
            {editing ? (
              <TextInput
                style={[s.fieldInput, { width: 100 }]}
                value={heightCm}
                onChangeText={setHeightCm}
                placeholder="175"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={s.fieldValue}>
                {heightCm ? `${heightCm} cm` : "—"}
              </Text>
            )}
          </View>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Weight ({weightUnit})</Text>
            {editing ? (
              <TextInput
                style={[s.fieldInput, { width: 100 }]}
                value={weightKg}
                onChangeText={setWeightKg}
                placeholder="75"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={s.fieldValue}>
                {weightKg ? `${weightKg} ${weightUnit}` : "—"}
              </Text>
            )}
          </View>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Target Weight ({weightUnit})</Text>
            {editing ? (
              <TextInput
                style={[s.fieldInput, { width: 100 }]}
                value={targetWeightKg}
                onChangeText={setTargetWeightKg}
                placeholder="70"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={s.fieldValue}>
                {targetWeightKg ? `${targetWeightKg} ${weightUnit}` : "—"}
              </Text>
            )}
          </View>
        </View>

        {/* Goals Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Goals</Text>

          <Text style={[s.fieldLabel, { marginBottom: 10 }]}>Goal Type</Text>
          {editing ? (
            <View style={s.goalRow}>
              {GOAL_TYPES.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[s.goalCard, goalType === g.id && s.goalCardActive]}
                  onPress={() => setGoalType(g.id)}
                >
                  <MaterialIcons
                    name={g.icon}
                    size={24}
                    color={goalType === g.id ? ORANGE : SUBTLE_TEXT}
                  />
                  <Text
                    style={[
                      s.goalCardText,
                      goalType === g.id && s.goalCardTextActive,
                    ]}
                  >
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={[s.fieldValue, { marginBottom: 12 }]}>
              {GOAL_TYPES.find((g) => g.id === goalType)?.label || "—"}
            </Text>
          )}

          {/* Weekly weight-change rate picker (cut / bulk only) */}
          {(goalType === "cut" || goalType === "bulk") && (
            <>
              <Text style={[s.fieldLabel, { marginBottom: 8, marginTop: 4 }]}>
                {goalType === "cut" ? "Weight Loss Rate" : "Weight Gain Rate"}
              </Text>
              {editing ? (
                <View style={s.rateRow}>
                  {(goalType === "cut"
                    ? WEEKLY_RATE_OPTIONS
                    : WEEKLY_BULK_OPTIONS
                  ).map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        s.rateChip,
                        weeklyWeightChange === opt.value && s.rateChipActive,
                      ]}
                      onPress={() => setWeeklyWeightChange(opt.value)}
                    >
                      <Text
                        style={[
                          s.rateChipText,
                          weeklyWeightChange === opt.value &&
                            s.rateChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={[s.fieldValue, { marginBottom: 12 }]}>
                  {Math.abs(weeklyWeightChange)} kg / week
                </Text>
              )}
            </>
          )}

          {/* Auto-calculate button (visible in edit mode) */}
          {editing && (
            <TouchableOpacity
              style={s.autoCalcBtn}
              onPress={() => {
                const h = heightCm ? parseFloat(heightCm) : 0;
                const w = weightKg ? parseFloat(weightKg) : 0;
                const a = age ? parseInt(age) : 0;
                if (!h || !w || !a || !gender || !goalType) {
                  Alert.alert(
                    "Missing Info",
                    "Please fill in height, weight, age, gender, and goal type first to auto-calculate.",
                  );
                  return;
                }
                autoCalculateGoals();
                Alert.alert(
                  "Goals Calculated",
                  "Calorie and protein goals have been set using the Harris-Benedict formula. You can still adjust them manually.",
                );
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="calculate" size={18} color={ORANGE} />
              <Text style={s.autoCalcBtnText}>Auto-Calculate Goals</Text>
            </TouchableOpacity>
          )}

          {/* Show formula note when not editing and goals are set but not manually */}
          {!editing && dailyCalorieGoal && !goalsManuallySet && (
            <Text style={s.autoCalcNote}>
              Calculated via Harris-Benedict formula (moderately active)
            </Text>
          )}

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Daily Calorie Goal</Text>
            {editing ? (
              <TextInput
                style={[s.fieldInput, { width: 100 }]}
                value={dailyCalorieGoal}
                onChangeText={(v) => {
                  setDailyCalorieGoal(v);
                  setGoalsManuallySet(true);
                }}
                placeholder="2000"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="numeric"
              />
            ) : (
              <Text style={s.fieldValue}>
                {dailyCalorieGoal ? `${dailyCalorieGoal} kcal` : "—"}
              </Text>
            )}
          </View>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Daily Protein Goal</Text>
            {editing ? (
              <TextInput
                style={[s.fieldInput, { width: 100 }]}
                value={dailyProteinGoal}
                onChangeText={(v) => {
                  setDailyProteinGoal(v);
                  setGoalsManuallySet(true);
                }}
                placeholder="150"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="numeric"
              />
            ) : (
              <Text style={s.fieldValue}>
                {dailyProteinGoal ? `${dailyProteinGoal} g` : "—"}
              </Text>
            )}
          </View>
        </View>

        {/* Preferences Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Preferences</Text>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Weight Unit</Text>
            {editing ? (
              <View style={s.chipRow}>
                {["kg", "lbs"].map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[s.chip, weightUnit === u && s.chipActive]}
                    onPress={() => setWeightUnit(u)}
                  >
                    <Text
                      style={[s.chipText, weightUnit === u && s.chipTextActive]}
                    >
                      {u.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={s.fieldValue}>{weightUnit.toUpperCase()}</Text>
            )}
          </View>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Distance Unit</Text>
            {editing ? (
              <View style={s.chipRow}>
                {["km", "mi"].map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[s.chip, distanceUnit === u && s.chipActive]}
                    onPress={() => setDistanceUnit(u)}
                  >
                    <Text
                      style={[
                        s.chipText,
                        distanceUnit === u && s.chipTextActive,
                      ]}
                    >
                      {u.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={s.fieldValue}>{distanceUnit.toUpperCase()}</Text>
            )}
          </View>
        </View>

        {/* Connected Apps Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Connected Apps</Text>

          {/* Apple Health */}
          <TouchableOpacity
            style={s.appRow}
            onPress={handleConnectAppleHealth}
            activeOpacity={0.7}
          >
            <View style={s.appIconWrap}>
              <MaterialIcons name="favorite" size={22} color="#FF2D55" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.appName}>Apple Health</Text>
              <Text style={s.appDesc}>
                Calories burned, steps, body measurements
              </Text>
            </View>
            <View
              style={[
                s.connectionBadge,
                appleHealthConnected && s.connectionBadgeConnected,
              ]}
            >
              <Text
                style={[
                  s.connectionBadgeText,
                  appleHealthConnected && s.connectionBadgeTextConnected,
                ]}
              >
                {appleHealthConnected ? "Connected" : "Connect"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* MyFitnessPal */}
          <TouchableOpacity
            style={s.appRow}
            onPress={handleConnectMFP}
            activeOpacity={0.7}
          >
            <View style={[s.appIconWrap, { backgroundColor: "#0073CF15" }]}>
              <MaterialIcons name="restaurant" size={22} color="#0073CF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.appName}>MyFitnessPal</Text>
              <Text style={s.appDesc}>
                Calories consumed, macros (via Apple Health)
              </Text>
            </View>
            <View
              style={[
                s.connectionBadge,
                mfpConnected && s.connectionBadgeConnected,
              ]}
            >
              <Text
                style={[
                  s.connectionBadgeText,
                  mfpConnected && s.connectionBadgeTextConnected,
                ]}
              >
                {mfpConnected ? "Connected" : "Connect"}
              </Text>
            </View>
          </TouchableOpacity>

          <Text style={s.appNote}>
            💡 MyFitnessPal shares nutrition data via Apple Health. Both must be
            connected for calorie/macro tracking to appear in Insights.
            {"\n\n"}
            ⚠️ Apple Health requires an EAS dev build — it won{"'"}t work in
            Expo Go.
          </Text>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={s.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <MaterialIcons name="logout" size={18} color={RED} />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  pageTitle: {
    color: WHITE,
    fontSize: 28,
    fontWeight: "bold",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ORANGE,
  },
  editBtnText: {
    color: ORANGE,
    fontSize: 14,
    fontWeight: "600",
  },

  // Avatar
  avatarSection: { alignItems: "center", marginBottom: 24 },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: CARD_BG,
    borderWidth: 2,
    borderColor: ORANGE + "60",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    color: ORANGE,
    fontSize: 32,
    fontWeight: "bold",
  },
  userName: { color: WHITE, fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  userEmail: { color: SUBTLE_TEXT, fontSize: 14 },

  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 14,
  },

  // Fields
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  fieldLabel: { color: SUBTLE_TEXT, fontSize: 14 },
  fieldValue: { color: WHITE, fontSize: 14, fontWeight: "500" },
  fieldInput: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: WHITE,
    fontSize: 14,
    textAlign: "right",
    minWidth: 140,
  },

  // Chips
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: "transparent",
  },
  chipActive: {
    borderColor: ORANGE,
    backgroundColor: ORANGE + "20",
  },
  chipText: { color: SUBTLE_TEXT, fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: ORANGE },

  // Goal cards
  goalRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  goalCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: INPUT_BG,
  },
  goalCardActive: {
    borderColor: ORANGE,
    backgroundColor: ORANGE + "15",
  },
  goalCardText: {
    color: SUBTLE_TEXT,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  goalCardTextActive: { color: ORANGE },

  // Weekly rate chips
  rateRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  rateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: INPUT_BG,
  },
  rateChipActive: {
    borderColor: ORANGE,
    backgroundColor: ORANGE + "20",
  },
  rateChipText: {
    color: SUBTLE_TEXT,
    fontSize: 13,
    fontWeight: "600",
  },
  rateChipTextActive: { color: ORANGE },

  // Auto-calculate
  autoCalcBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ORANGE + "50",
    backgroundColor: ORANGE + "10",
  },
  autoCalcBtnText: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: "600",
  },
  autoCalcNote: {
    color: SUBTLE_TEXT,
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 6,
  },

  // Connected apps
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  appIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FF2D5515",
    alignItems: "center",
    justifyContent: "center",
  },
  appName: { color: WHITE, fontSize: 15, fontWeight: "600" },
  appDesc: { color: SUBTLE_TEXT, fontSize: 12, marginTop: 2 },
  connectionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  connectionBadgeConnected: {
    borderColor: GREEN,
    backgroundColor: GREEN + "15",
  },
  connectionBadgeText: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    fontWeight: "600",
  },
  connectionBadgeTextConnected: { color: GREEN },
  appNote: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
    paddingHorizontal: 4,
  },

  // Sign Out
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: RED + "40",
    backgroundColor: RED + "10",
    marginTop: 8,
  },
  signOutText: {
    color: RED,
    fontSize: 15,
    fontWeight: "600",
  },
});
