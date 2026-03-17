import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Exercise, WorkoutSet, Workout } from "@/data/mock-workouts";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useCallback } from "react";
import { getWorkout, updateWorkout, deleteWorkout } from "@/services/api";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const TAG_BG = "#2A2A2A";
const RED = "#E74C3C";
const GREEN = "#2ECC71";
const BORDER_COLOR = "#333";

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  return date.toLocaleDateString("en-US", options);
}

function formatRestTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ExerciseTag({ label, active }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.tag, active && { backgroundColor: ORANGE }]}>
      <Text style={[styles.tagText, active && { color: WHITE }]}>{label}</Text>
    </View>
  );
}

function SetRow({ set }: { set: WorkoutSet }) {
  return (
    <View style={styles.setRow}>
      <Text style={styles.setNumber}>{set.setNumber}</Text>
      <Text style={styles.setText}>
        {set.weight > 0
          ? `${set.weight} ${set.weightUnit}, ${set.reps} reps`
          : `${set.reps} reps`}
        {set.restSeconds ? `, ${formatRestTime(set.restSeconds)}` : ""}
      </Text>
    </View>
  );
}

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const totalSets = exercise.sets.length;

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName}>
          {exercise.name} ({exercise.equipment})
        </Text>
        <Text style={styles.exerciseSetsCount}>{totalSets} Sets</Text>
      </View>

      <View style={styles.exerciseDivider} />

      {exercise.sets.map((set) => (
        <SetRow key={set.id} set={set} />
      ))}

      {exercise.tags && exercise.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {exercise.tags.map((tag) => (
            <ExerciseTag
              key={tag}
              label={tag}
              active={tag === "Volume" || tag === "1RM"}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── Editing State ─────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editExercises, setEditExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await getWorkout(id);
        if (res.ok) {
          const data = await res.json();
          // Normalize the data to match the Workout interface
          const normalized: Workout = {
            id: data.id || data._id,
            title: data.title,
            date: data.date,
            type: data.type || "Tracked Workout",
            description: data.description,
            exerciseNames: data.exerciseNames || [],
            exercises: (data.exercises || []).map(
              (
                ex: {
                  name: string;
                  equipment: string;
                  tags?: string[];
                  sets: {
                    setNumber: number;
                    weight: number;
                    reps: number;
                  }[];
                },
                exIdx: number,
              ) => ({
                id: `ex-${exIdx}`,
                name: ex.name,
                equipment: ex.equipment,
                tags: ex.tags || [],
                sets: (ex.sets || []).map(
                  (
                    s: { setNumber: number; weight: number; reps: number },
                    sIdx: number,
                  ) => ({
                    id: `s-${exIdx}-${sIdx}`,
                    setNumber: s.setNumber,
                    weight: s.weight,
                    weightUnit: "kg" as const,
                    reps: s.reps,
                  }),
                ),
              }),
            ),
            stats: {
              workingSets: data.stats?.workingSets || 0,
              duration: data.stats?.duration || "0m",
              estCalories: data.stats?.estCalories || 0,
              totalWeight: data.stats?.totalWeight || 0,
              totalWeightUnit: "kg",
              prs: data.stats?.prs || 0,
            },
            cardio: data.cardio || null,
            warmup: data.warmup || null,
          };
          setWorkout(normalized);
        }
      } catch (err) {
        console.warn("Failed to fetch workout:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ─── Edit / Delete Handlers ────────────────────────

  const startEditing = useCallback(() => {
    if (!workout) return;
    setEditTitle(workout.title);
    setEditDescription(workout.description || "");
    setEditExercises(
      workout.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({ ...s })),
      })),
    );
    setIsEditing(true);
  }, [workout]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleUpdateSet = useCallback(
    (
      exIdx: number,
      setIdx: number,
      field: "weight" | "reps",
      value: string,
    ) => {
      setEditExercises((prev) =>
        prev.map((ex, ei) => {
          if (ei !== exIdx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, si) => {
              if (si !== setIdx) return s;
              return {
                ...s,
                [field]:
                  field === "weight"
                    ? parseFloat(value) || 0
                    : parseInt(value) || 0,
              };
            }),
          };
        }),
      );
    },
    [],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!workout || !id) return;
    setSaving(true);
    try {
      const exercisePayload = editExercises.map((ex) => ({
        name: ex.name,
        equipment: ex.equipment,
        tags: ex.tags || [],
        sets: ex.sets.map((s, idx) => ({
          setNumber: idx + 1,
          weight: s.weight,
          reps: s.reps,
        })),
      }));

      const res = await updateWorkout(id, {
        title: editTitle,
        type: workout.type,
        date: workout.date,
        description: editDescription,
        exercises: exercisePayload,
      });

      if (res.ok) {
        const data = await res.json();
        // Re-normalize updated data
        setWorkout({
          ...workout,
          title: data.title,
          description: data.description,
          exerciseNames: data.exerciseNames || [],
          exercises: (data.exercises || []).map((ex: any, exIdx: number) => ({
            id: `ex-${exIdx}`,
            name: ex.name,
            equipment: ex.equipment,
            tags: ex.tags || [],
            sets: (ex.sets || []).map((s: any, sIdx: number) => ({
              id: `s-${exIdx}-${sIdx}`,
              setNumber: s.setNumber,
              weight: s.weight,
              weightUnit: "kg" as const,
              reps: s.reps,
            })),
          })),
          stats: {
            workingSets: data.stats?.workingSets || 0,
            duration: data.stats?.duration || "0m",
            estCalories: data.stats?.estCalories || 0,
            totalWeight: data.stats?.totalWeight || 0,
            totalWeightUnit: "kg",
            prs: data.stats?.prs || 0,
          },
          cardio: data.cardio || workout.cardio || null,
          warmup: data.warmup || workout.warmup || null,
        });
        setIsEditing(false);
        Alert.alert("Success", "Workout updated successfully.");
      } else {
        Alert.alert("Error", "Failed to update workout.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [workout, id, editTitle, editDescription, editExercises]);

  const handleDelete = useCallback(() => {
    if (!id || !workout) return;
    Alert.alert(
      "Delete Workout",
      `Are you sure you want to delete "${workout.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await deleteWorkout(id);
              if (res.ok || res.status === 204) {
                Alert.alert("Deleted", "Workout has been deleted.", [
                  { text: "OK", onPress: () => router.back() },
                ]);
              } else {
                Alert.alert("Error", "Failed to delete workout.");
              }
            } catch {
              Alert.alert("Error", "Network error. Please try again.");
            }
          },
        },
      ],
    );
  }, [id, workout, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={ORANGE} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Workout not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.errorText, { color: ORANGE, marginTop: 12 }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const descriptionText = workout.description || "";
  const isLongDesc = descriptionText.length > 100;
  const displayDesc =
    !descExpanded && isLongDesc
      ? descriptionText.slice(0, 100) + "..."
      : descriptionText;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (isEditing) {
              cancelEditing();
            } else {
              router.back();
            }
          }}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons
            name={isEditing ? "close" : "arrow-back"}
            size={24}
            color={WHITE}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? "Edit Workout" : workout.title}
        </Text>
        {isEditing ? (
          <TouchableOpacity
            style={styles.headerSaveBtn}
            onPress={handleSaveEdit}
            disabled={saving}
          >
            <Text style={[styles.headerSaveText, saving && { opacity: 0.4 }]}>
              {saving ? "SAVING…" : "SAVE"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.editButton} onPress={startEditing}>
              <MaterialIcons name="edit" size={20} color={WHITE} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <MaterialIcons name="delete" size={20} color={RED} />
            </TouchableOpacity>
          </View>
        )}
      </View>

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
          {/* Title */}
          {isEditing ? (
            <TextInput
              style={styles.editTitleInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Workout Title"
              placeholderTextColor={SUBTLE_TEXT}
            />
          ) : (
            <Text style={styles.workoutTitle}>{workout.title}</Text>
          )}

          {/* Date */}
          <View style={styles.dateRow}>
            <MaterialIcons
              name="calendar-today"
              size={14}
              color={SUBTLE_TEXT}
            />
            <Text style={styles.dateText}>{formatDate(workout.date)}</Text>
          </View>

          {/* Description */}
          {isEditing ? (
            <TextInput
              style={styles.editDescriptionInput}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Add description or note"
              placeholderTextColor={SUBTLE_TEXT}
              multiline
            />
          ) : (
            descriptionText.length > 0 && (
              <View style={styles.descriptionContainer}>
                <Text style={styles.descriptionText}>
                  {displayDesc}
                  {isLongDesc && !descExpanded && (
                    <Text
                      style={styles.moreText}
                      onPress={() => setDescExpanded(true)}
                    >
                      {" "}
                      More
                    </Text>
                  )}
                </Text>
              </View>
            )
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{workout.stats.duration}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {workout.stats.totalWeight?.toLocaleString()}{" "}
                {workout.stats.totalWeightUnit}
              </Text>
              <Text style={styles.statLabel}>Total Weight</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.prBadge}>
                <MaterialIcons name="emoji-events" size={16} color={ORANGE} />
                <Text style={styles.prValue}>{workout.stats.prs}</Text>
              </View>
              <Text style={styles.statLabel}>PRs</Text>
            </View>
          </View>

          {/* Exercises Section */}
          <Text style={styles.sectionTitle}>Exercises</Text>

          {isEditing
            ? editExercises.map((exercise, exIdx) => (
                <View key={exercise.id} style={styles.exerciseCard}>
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseName}>
                      {exercise.name} ({exercise.equipment})
                    </Text>
                    <Text style={styles.exerciseSetsCount}>
                      {exercise.sets.length} Sets
                    </Text>
                  </View>
                  <View style={styles.exerciseDivider} />
                  {/* Column Headers for edit */}
                  <View style={styles.editColumnHeaders}>
                    <Text style={[styles.editColText, { width: 30 }]}>Set</Text>
                    <Text style={[styles.editColText, { flex: 1 }]}>
                      Weight (kg)
                    </Text>
                    <Text style={[styles.editColText, { flex: 1 }]}>Reps</Text>
                  </View>
                  {exercise.sets.map((set, setIdx) => (
                    <View key={set.id} style={styles.editSetRow}>
                      <Text style={styles.editSetNumber}>{set.setNumber}</Text>
                      <TextInput
                        style={styles.editSetInput}
                        value={String(set.weight)}
                        onChangeText={(v) =>
                          handleUpdateSet(exIdx, setIdx, "weight", v)
                        }
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#555"
                      />
                      <TextInput
                        style={styles.editSetInput}
                        value={String(set.reps)}
                        onChangeText={(v) =>
                          handleUpdateSet(exIdx, setIdx, "reps", v)
                        }
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#555"
                      />
                    </View>
                  ))}
                </View>
              ))
            : workout.exercises.map((exercise) => (
                <ExerciseCard key={exercise.id} exercise={exercise} />
              ))}

          {/* Cardio Section */}
          {workout.cardio &&
            workout.cardio.segments &&
            workout.cardio.segments.length > 0 && (
              <View style={{ marginTop: 8, marginBottom: 16 }}>
                <Text style={styles.sectionTitle}>
                  <MaterialIcons
                    name="directions-run"
                    size={18}
                    color={ORANGE}
                  />{" "}
                  {workout.cardio.type} Cardio
                </Text>
                {workout.cardio.segments.map((seg, idx) => (
                  <View key={idx} style={styles.cardioSegmentCard}>
                    <View style={styles.cardioSegmentHeader}>
                      <View
                        style={[
                          styles.cardioSegmentBadge,
                          seg.completed && { backgroundColor: GREEN },
                        ]}
                      >
                        {seg.completed ? (
                          <MaterialIcons name="check" size={14} color={WHITE} />
                        ) : (
                          <Text style={styles.cardioSegmentBadgeText}>
                            {idx + 1}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardioSegmentDuration}>
                          {seg.durationMinutes} min
                        </Text>
                        <Text style={styles.cardioSegmentDetail}>
                          {seg.speed ? `Speed ${seg.speed}` : ""}
                          {seg.speed && seg.incline ? " · " : ""}
                          {seg.incline ? `Incline ${seg.incline}%` : ""}
                          {!seg.speed && !seg.incline ? "—" : ""}
                        </Text>
                      </View>
                      {seg.completed && (
                        <Text style={styles.cardioCompletedLabel}>Done</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

          {/* Delete button at bottom (view mode only) */}
          {!isEditing && (
            <TouchableOpacity
              style={styles.deleteWorkoutBtn}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <MaterialIcons name="delete-outline" size={18} color={RED} />
              <Text style={styles.deleteWorkoutBtnText}>Delete Workout</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: WHITE,
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2A2A2A",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: ORANGE,
    borderRadius: 8,
  },
  headerSaveText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "700",
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  editTitleInput: {
    color: WHITE,
    fontSize: 24,
    fontWeight: "bold",
    borderBottomWidth: 1,
    borderBottomColor: ORANGE,
    paddingVertical: 8,
    marginBottom: 8,
  },
  editDescriptionInput: {
    color: WHITE,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    minHeight: 60,
    textAlignVertical: "top",
  },
  editColumnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  editColText: {
    color: SUBTLE_TEXT,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  editSetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  editSetNumber: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    width: 24,
    fontWeight: "600",
    textAlign: "center",
  },
  editSetInput: {
    flex: 1,
    backgroundColor: "#2A2A2A",
    borderRadius: 8,
    color: WHITE,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: "center",
  },
  deleteWorkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 10,
    marginTop: 12,
  },
  deleteWorkoutBtnText: {
    color: RED,
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  workoutTitle: {
    color: WHITE,
    fontSize: 28,
    fontWeight: "bold",
    fontStyle: "italic",
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  dateText: {
    color: SUBTLE_TEXT,
    fontSize: 13,
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  descriptionText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  moreText: {
    color: WHITE,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#2A2A2A",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  statLabel: {
    color: SUBTLE_TEXT,
    fontSize: 12,
  },
  prBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  prValue: {
    color: ORANGE,
    fontSize: 18,
    fontWeight: "bold",
  },
  sectionTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
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
    marginBottom: 8,
  },
  exerciseName: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "bold",
    flex: 1,
  },
  exerciseSetsCount: {
    color: SUBTLE_TEXT,
    fontSize: 13,
  },
  exerciseDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#333",
    marginBottom: 10,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  setNumber: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    width: 24,
    fontWeight: "600",
  },
  setText: {
    color: "#CCC",
    fontSize: 14,
  },
  tagsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: TAG_BG,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tagText: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    fontWeight: "600",
  },

  // Cardio section
  cardioSegmentCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  cardioSegmentHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  cardioSegmentBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cardioSegmentBadgeText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "bold" as const,
  },
  cardioSegmentDuration: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "bold" as const,
  },
  cardioSegmentDetail: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    marginTop: 1,
  },
  cardioCompletedLabel: {
    color: GREEN,
    fontSize: 12,
    fontWeight: "600" as const,
  },
});
