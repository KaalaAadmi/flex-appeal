import { useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useRef, useCallback } from "react";
import { ExerciseCatalogItem } from "@/data/exercise-catalog";
import { DAYS_OF_WEEK, DayOfWeek } from "@/data/routine-types";
import {
  createWorkout,
  getExercises,
  getActiveRoutine,
  getRoutines,
} from "@/services/api";
import { getCumulativeActiveCalories } from "@/services/health";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const INPUT_BG = "#2A2019";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const BORDER_COLOR = "#333";

// ─── Types ───────────────────────────────────────────────

interface TrackingSet {
  id: string;
  weight: string;
  reps: string;
  previous?: string; // e.g. "(22 kg) × 12"
}

interface TrackingExercise {
  id: string;
  name: string;
  equipment: string;
  sets: TrackingSet[];
}

// ─── Helpers ─────────────────────────────────────────────

let setIdCounter = 0;
function nextSetId() {
  return `ts-${++setIdCounter}`;
}

let exerciseIdCounter = 0;
function nextExerciseId() {
  return `te-${++exerciseIdCounter}`;
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

// ─── Exercise Picker Modal ──────────────────────────────

function ExercisePickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: ExerciseCatalogItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [exercises, setExercises] = useState<ExerciseCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch exercises from API with debounce
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params: { search?: string } = {};
        if (search.trim()) params.search = search.trim();
        const res = await getExercises(params);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setExercises(
            (data.exercises || []).map((e: any) => ({
              id: e.id ?? e._id,
              name: e.name,
              equipment: e.equipment,
              category: e.category,
            })),
          );
        } else if (!cancelled) {
          console.warn("Exercises API error:", res.status);
          setExercises([]);
        }
      } catch (err) {
        console.warn("Exercises fetch failed:", err);
        if (!cancelled) setExercises([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={pickerStyles.container}>
        {/* Header */}
        <View style={pickerStyles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color={WHITE} />
          </TouchableOpacity>
          <Text style={pickerStyles.headerTitle}>Add Exercise</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Search */}
        <View style={pickerStyles.searchContainer}>
          <MaterialIcons
            name="search"
            size={20}
            color={SUBTLE_TEXT}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={pickerStyles.searchInput}
            placeholder="Search exercises..."
            placeholderTextColor={SUBTLE_TEXT}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        {/* List */}
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }: { item: ExerciseCatalogItem }) => (
            <TouchableOpacity
              style={pickerStyles.exerciseRow}
              onPress={() => {
                onSelect(item);
                setSearch("");
              }}
              activeOpacity={0.6}
            >
              <View style={{ flex: 1 }}>
                <Text style={pickerStyles.exerciseName}>{item.name}</Text>
                <Text style={pickerStyles.exerciseMeta}>
                  {item.equipment} · {item.category}
                </Text>
              </View>
              <MaterialIcons name="add" size={22} color={ORANGE} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator
                color={ORANGE}
                size="large"
                style={{ marginTop: 40 }}
              />
            ) : (
              <Text style={pickerStyles.emptyText}>No exercises found</Text>
            )
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  headerTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  searchInput: {
    flex: 1,
    color: WHITE,
    fontSize: 15,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  exerciseName: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  exerciseMeta: {
    color: SUBTLE_TEXT,
    fontSize: 12,
  },
  emptyText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
});

// ─── Set Row Component ──────────────────────────────────

function SetRowInput({
  set,
  onWeightChange,
  onRepsChange,
  onRemove,
}: {
  set: TrackingSet;
  onWeightChange: (val: string) => void;
  onRepsChange: (val: string) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.setRow}>
      {/* Set Number */}
      <Text style={styles.setNumber}>
        {set.id ? set.id.split("-").pop() : ""}
      </Text>

      {/* Previous */}
      <View style={styles.previousCol}>
        <Text style={styles.previousText} numberOfLines={1}>
          {set.previous || "—"}
        </Text>
      </View>

      {/* Weight */}
      <TextInput
        style={styles.inputCell}
        value={set.weight}
        onChangeText={onWeightChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor="#555"
      />

      {/* Reps */}
      <TextInput
        style={styles.inputCell}
        value={set.reps}
        onChangeText={onRepsChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor="#555"
      />

      {/* Remove */}
      <TouchableOpacity onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <MaterialIcons name="close" size={16} color={SUBTLE_TEXT} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Exercise Card (Tracking) ───────────────────────────

function TrackingExerciseCard({
  exercise,
  exerciseIndex,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  exercise: TrackingExercise;
  exerciseIndex: number;
  onUpdateSet: (
    exerciseIndex: number,
    setIndex: number,
    field: "weight" | "reps",
    value: string,
  ) => void;
  onAddSet: (exerciseIndex: number) => void;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void;
  onRemoveExercise: (exerciseIndex: number) => void;
}) {
  return (
    <View style={styles.exerciseCard}>
      {/* Exercise Title */}
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName}>
          {exercise.name} ({exercise.equipment})
        </Text>
        <TouchableOpacity
          onPress={() => onRemoveExercise(exerciseIndex)}
          hitSlop={8}
        >
          <MaterialIcons name="more-vert" size={20} color={SUBTLE_TEXT} />
        </TouchableOpacity>
      </View>

      {/* Column Headers */}
      <View style={styles.columnHeaders}>
        <Text style={[styles.colHeaderText, { width: 30 }]}>Set</Text>
        <Text style={[styles.colHeaderText, { flex: 1 }]}>Previous</Text>
        <Text
          style={[styles.colHeaderText, { width: 60, textAlign: "center" }]}
        >
          Weight
        </Text>
        <Text
          style={[styles.colHeaderText, { width: 60, textAlign: "center" }]}
        >
          Reps
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Set Rows */}
      {exercise.sets.map((set, setIdx) => (
        <SetRowInput
          key={set.id}
          set={{ ...set, id: `set-${setIdx + 1}` }}
          onWeightChange={(val) =>
            onUpdateSet(exerciseIndex, setIdx, "weight", val)
          }
          onRepsChange={(val) =>
            onUpdateSet(exerciseIndex, setIdx, "reps", val)
          }
          onRemove={() => onRemoveSet(exerciseIndex, setIdx)}
        />
      ))}

      {/* Add Set */}
      <TouchableOpacity
        style={styles.addSetBtn}
        onPress={() => onAddSet(exerciseIndex)}
      >
        <Text style={styles.addSetText}>ADD SET</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────

/** Get today's day-of-week as a DayOfWeek string */
function getTodayDayOfWeek(): DayOfWeek {
  const jsDay = new Date().getDay(); // 0=Sun,1=Mon,...6=Sat
  return DAYS_OF_WEEK[(jsDay + 6) % 7]; // shift so 0=Mon
}

/** Format date as "DayOfWeek dd/mm/yyyy", e.g. "Monday 10/03/2026" */
function formatWorkoutTitle(): string {
  const now = new Date();
  const day = getTodayDayOfWeek();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${day} ${dd}/${mm}/${yyyy}`;
}

export default function TrackWorkoutScreen() {
  const router = useRouter();
  const [workoutName, setWorkoutName] = useState(formatWorkoutTitle());
  const [description, setDescription] = useState("");
  const [exercises, setExercises] = useState<TrackingExercise[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startCaloriesRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [dayLabel, setDayLabel] = useState<string>("");
  const [isRestDay, setIsRestDay] = useState(false);

  // Snapshot cumulative active calories at mount for diff-based tracking
  useEffect(() => {
    if (Platform.OS === "ios") {
      getCumulativeActiveCalories()
        .then((cals) => {
          startCaloriesRef.current = cals;
          if (__DEV__)
            console.log("[TrackWorkout] Baseline active calories:", cals);
        })
        .catch((err) =>
          console.warn("Could not snapshot baseline calories:", err),
        );
    }
  }, []);

  // Load today's exercises from the active routine
  useEffect(() => {
    (async () => {
      try {
        // 1. Try the dedicated active-routine endpoint
        let routine: any = null;
        const activeRes = await getActiveRoutine();

        if (activeRes.ok) {
          routine = await activeRes.json();
          if (__DEV__)
            console.log("[TrackWorkout] Active routine found:", routine.name);
        } else {
          // 2. Fallback: fetch all routines and pick the one marked active,
          //    or simply use the first routine if none is marked active.
          if (__DEV__)
            console.log(
              "[TrackWorkout] No active routine endpoint hit, status:",
              activeRes.status,
              "— falling back to getRoutines()",
            );
          const allRes = await getRoutines();
          if (allRes.ok) {
            const data = await allRes.json();
            const list = data.routines || [];
            routine =
              list.find((r: any) => r.active === true) || list[0] || null;
            if (__DEV__)
              console.log(
                "[TrackWorkout] Fallback routine:",
                routine?.name ?? "none",
              );
          }
        }

        if (!routine) {
          // No routine at all — let user add exercises manually
          if (__DEV__)
            console.log("[TrackWorkout] No routine available, showing empty");
          setLoading(false);
          return;
        }

        setRoutineId(routine.id ?? routine._id ?? null);

        const today = getTodayDayOfWeek();
        if (__DEV__)
          console.log(
            "[TrackWorkout] Today is:",
            today,
            "| Routine days:",
            (routine.days || []).map((d: any) => d.dayOfWeek),
          );

        // routine.days is the array saved in the DB; each has dayOfWeek
        const todayDay = (routine.days || []).find(
          (d: any) => d.dayOfWeek === today,
        );

        if (!todayDay) {
          if (__DEV__)
            console.log(
              "[TrackWorkout] No matching day found for",
              today,
              "— showing empty",
            );
          setLoading(false);
          return;
        }

        if (todayDay.isRest) {
          setIsRestDay(true);
          setDayLabel(todayDay.label ?? "Rest");
          setLoading(false);
          return;
        }

        setDayLabel(todayDay.label ?? "");

        if (__DEV__)
          console.log(
            "[TrackWorkout] Today's label:",
            todayDay.label,
            "| Exercises:",
            (todayDay.exercises || []).length,
          );

        // Pre-populate exercises from the routine day
        const mapped: TrackingExercise[] = (todayDay.exercises || []).map(
          (ex: any) => ({
            id: nextExerciseId(),
            name: ex.name,
            equipment: ex.equipment || "",
            sets: Array.from({ length: ex.sets || 1 }, () => ({
              id: nextSetId(),
              weight: "",
              reps: ex.reps ? ex.reps.split("-")[0] : "", // default to lower bound
              previous: "—",
            })),
          }),
        );

        setExercises(mapped);
      } catch (err) {
        console.warn("Failed to load active routine:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Timer — start only after loading completes
  useEffect(() => {
    if (loading) return;
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  // Computed stats
  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  const totalCalories = Math.round((elapsed / 60) * 8); // rough estimate

  // ─── Handlers ────────────────────────────────────────

  const handleUpdateSet = useCallback(
    (
      exIdx: number,
      setIdx: number,
      field: "weight" | "reps",
      value: string,
    ) => {
      setExercises((prev) => {
        const copy = prev.map((ex, ei) => {
          if (ei !== exIdx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, si) => {
              if (si !== setIdx) return s;
              return { ...s, [field]: value };
            }),
          };
        });
        return copy;
      });
    },
    [],
  );

  const handleAddSet = useCallback((exIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, ei) => {
        if (ei !== exIdx) return ex;
        return {
          ...ex,
          sets: [
            ...ex.sets,
            { id: nextSetId(), weight: "", reps: "", previous: "—" },
          ],
        };
      }),
    );
  }, []);

  const handleRemoveSet = useCallback((exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, ei) => {
        if (ei !== exIdx) return ex;
        if (ex.sets.length <= 1) return ex; // keep at least 1 set
        return {
          ...ex,
          sets: ex.sets.filter((_, si) => si !== setIdx),
        };
      }),
    );
  }, []);

  const handleRemoveExercise = useCallback((exIdx: number) => {
    Alert.alert(
      "Remove Exercise",
      "Are you sure you want to remove this exercise?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            setExercises((prev) => prev.filter((_, i) => i !== exIdx)),
        },
      ],
    );
  }, []);

  const handleAddExercise = useCallback((item: ExerciseCatalogItem) => {
    setExercises((prev) => [
      ...prev,
      {
        id: nextExerciseId(),
        name: item.name,
        equipment: item.equipment,
        sets: [{ id: nextSetId(), weight: "", reps: "", previous: "—" }],
      },
    ]);
    setPickerVisible(false);
  }, []);

  const handleSave = useCallback(async () => {
    // Build the exercises payload for the API
    const exercisePayload = exercises.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment,
      tags: [],
      sets: ex.sets.map((s, idx) => ({
        setNumber: idx + 1,
        weight: parseFloat(s.weight) || 0,
        reps: parseInt(s.reps) || 0,
      })),
    }));

    // Compute workout calories via snapshot diff
    let caloriesBurned: number | undefined;
    if (Platform.OS === "ios" && startCaloriesRef.current !== null) {
      try {
        const endCalories = await getCumulativeActiveCalories();
        if (endCalories !== null) {
          const diff = endCalories - startCaloriesRef.current;
          if (__DEV__)
            console.log(
              `[TrackWorkout] Calories: start=${startCaloriesRef.current}, end=${endCalories}, diff=${diff}`,
            );
          if (diff > 0) {
            caloriesBurned = Math.round(diff);
          }
        }
      } catch (err) {
        console.warn("Could not read Apple Health calories:", err);
      }
    }

    try {
      const payload: Record<string, any> = {
        title: workoutName,
        type: dayLabel || "Tracked Workout",
        date: new Date().toISOString(),
        description,
        exercises: exercisePayload,
        durationSeconds: elapsed,
        ...(routineId ? { routineId } : {}),
      };
      if (caloriesBurned !== undefined) {
        payload.caloriesBurned = caloriesBurned;
      }

      const res = await createWorkout(payload);

      if (res.ok) {
        Alert.alert("Workout Saved", `"${workoutName}" has been saved.`, [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("Error", "Failed to save workout. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please check your connection.");
    }
  }, [
    workoutName,
    description,
    exercises,
    elapsed,
    router,
    routineId,
    dayLabel,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Workout</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading || isRestDay}>
          <Text
            style={[
              styles.saveText,
              (loading || isRestDay) && { opacity: 0.4 },
            ]}
          >
            SAVE
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={styles.loadingText}>Loading routine…</Text>
        </View>
      ) : isRestDay ? (
        <View style={styles.restDayContainer}>
          <MaterialIcons name="self-improvement" size={64} color={ORANGE} />
          <Text style={styles.restDayTitle}>Rest Day</Text>
          <Text style={styles.restDaySubtitle}>
            Today is a rest day in your active routine. Enjoy your recovery!
          </Text>
          <TouchableOpacity
            style={styles.restDayBackBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.restDayBackText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Workout Name */}
            <Text style={styles.fieldLabel}>Workout Name</Text>
            <TextInput
              style={styles.workoutNameInput}
              value={workoutName}
              onChangeText={setWorkoutName}
              placeholder="Workout Name"
              placeholderTextColor={SUBTLE_TEXT}
            />

            {/* Description */}
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Add description or note"
              placeholderTextColor={SUBTLE_TEXT}
              multiline
            />

            {/* Stats Bar */}
            <View style={styles.statsBar}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {totalSets > 0 ? totalSets : "—"}
                </Text>
                <Text style={styles.statLabel}>Working Sets</Text>
              </View>
              <View style={[styles.statBox, styles.timerBox]}>
                <Text style={styles.timerValue}>{formatTimer(elapsed)}</Text>
                <Text style={styles.statLabel}>Duration</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {totalCalories > 0 ? totalCalories : "—"}
                </Text>
                <Text style={styles.statLabel}>Est Calories</Text>
              </View>
            </View>

            {/* Exercise Cards */}
            {exercises.map((exercise, exIdx) => (
              <TrackingExerciseCard
                key={exercise.id}
                exercise={exercise}
                exerciseIndex={exIdx}
                onUpdateSet={handleUpdateSet}
                onAddSet={handleAddSet}
                onRemoveSet={handleRemoveSet}
                onRemoveExercise={handleRemoveExercise}
              />
            ))}

            {/* Add Exercise Button */}
            <TouchableOpacity
              style={styles.addExerciseBtn}
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="add" size={20} color={ORANGE} />
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </TouchableOpacity>

            <View style={{ height: 60 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Exercise Picker Modal */}
      <ExercisePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleAddExercise}
      />
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  headerTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "600",
  },
  saveText: {
    color: ORANGE,
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 0.3,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Workout name & description
  fieldLabel: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  workoutNameInput: {
    color: WHITE,
    fontSize: 24,
    fontWeight: "bold",
    fontStyle: "italic",
    paddingVertical: 6,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  descriptionInput: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    paddingVertical: 8,
    marginBottom: 20,
    minHeight: 36,
  },

  // Stats bar
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER_COLOR,
    paddingVertical: 14,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  timerBox: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER_COLOR,
  },
  statValue: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  timerValue: {
    color: ORANGE,
    fontSize: 22,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
    marginBottom: 2,
  },
  statLabel: {
    color: SUBTLE_TEXT,
    fontSize: 11,
  },

  // Exercise card
  exerciseCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  exerciseName: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "bold",
    flex: 1,
  },

  // Column headers
  columnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  colHeaderText: {
    color: SUBTLE_TEXT,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },

  // Set row
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  setNumber: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
    width: 30,
  },
  previousCol: {
    flex: 1,
    paddingRight: 8,
  },
  previousText: {
    color: SUBTLE_TEXT,
    fontSize: 12,
  },
  inputCell: {
    width: 60,
    height: 36,
    backgroundColor: INPUT_BG,
    borderRadius: 6,
    color: WHITE,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: "#3D2E1A",
  },
  removeBtn: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  // Add set
  addSetBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  addSetText: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  // Add exercise
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 12,
    borderStyle: "dashed",
    gap: 8,
  },
  addExerciseText: {
    color: ORANGE,
    fontSize: 15,
    fontWeight: "600",
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    marginTop: 8,
  },

  // Rest day
  restDayContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  restDayTitle: {
    color: WHITE,
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 8,
  },
  restDaySubtitle: {
    color: SUBTLE_TEXT,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  restDayBackBtn: {
    marginTop: 24,
    backgroundColor: ORANGE,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  restDayBackText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
});
