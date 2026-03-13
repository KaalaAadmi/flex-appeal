import { useRouter, useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useCallback, useEffect } from "react";
import DragList, { DragListRenderItemInfo } from "react-native-draglist";
import {
  ROUTINE_TEMPLATES,
  RoutineTemplate,
  DAYS_OF_WEEK,
  DayOfWeek,
  WARMUP_TYPES,
  WarmupType,
  CARDIO_TYPES,
  CardioType,
  CardioSegment,
  RoutineDay,
  RoutineDayExercise,
  Routine,
} from "@/data/routine-types";
import {
  getRoutine,
  createRoutine as apiCreateRoutine,
  updateRoutine as apiUpdateRoutine,
  getExercises,
} from "@/services/api";
import { ExerciseCatalogItem } from "@/data/exercise-catalog";

// ─── Theme Constants ─────────────────────────────────

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const INPUT_BG = "#2A2019";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const BORDER_COLOR = "#333";
const GREEN = "#2ECC71";

// Steps: 0=Template, 1=CycleStart/CustomConfig, 2=DayExercises, 3=Warmup, 4=Cardio, 5=Summary
type Step = 0 | 1 | 2 | 3 | 4 | 5;

let _segId = 0;
function nextSegId() {
  return `seg-${++_segId}`;
}
let _exId = 0;
function nextRoutineExId() {
  return `rex-${++_exId}`;
}

// ─── Exercise Picker (reused) ────────────────────────

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

  // Fetch exercises from API whenever search changes (debounced)
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
      <SafeAreaView style={modalStyles.container}>
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color={WHITE} />
          </TouchableOpacity>
          <Text style={modalStyles.headerTitle}>Add Exercise</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={modalStyles.searchContainer}>
          <MaterialIcons
            name="search"
            size={20}
            color={SUBTLE_TEXT}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={modalStyles.searchInput}
            placeholder="Search exercises..."
            placeholderTextColor={SUBTLE_TEXT}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={modalStyles.exerciseRow}
              onPress={() => {
                onSelect(item);
                setSearch("");
              }}
              activeOpacity={0.6}
            >
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.exerciseName}>{item.name}</Text>
                <Text style={modalStyles.exerciseMeta}>
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
              <Text style={modalStyles.emptyText}>No exercises found</Text>
            )
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  headerTitle: { color: WHITE, fontSize: 17, fontWeight: "600" },
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
  searchInput: { flex: 1, color: WHITE, fontSize: 15 },
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
  exerciseMeta: { color: SUBTLE_TEXT, fontSize: 12 },
  emptyText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
});

// ══════════════════════════════════════════════════════
// STEP 0 — Template Selection
// ══════════════════════════════════════════════════════

function StepTemplate({
  onSelect,
}: {
  onSelect: (t: RoutineTemplate) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={s.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.stepTitle}>Choose a Routine</Text>
      <Text style={s.stepSubtitle}>
        Select a template or create a fully custom routine.
      </Text>
      {ROUTINE_TEMPLATES.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={s.templateCard}
          activeOpacity={0.7}
          onPress={() => onSelect(t)}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.templateName}>{t.name}</Text>
            <Text style={s.templateDesc}>{t.description}</Text>
            {t.id !== "custom" && (
              <Text style={s.templateMeta}>
                {t.daysPerWeek} days/week · {7 - t.daysPerWeek} rest
              </Text>
            )}
          </View>
          <MaterialIcons name="chevron-right" size={22} color={SUBTLE_TEXT} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════
// STEP 1 — Cycle Start Day / Custom Config
// ══════════════════════════════════════════════════════

function StepCycleConfig({
  template,
  cycleStartDay,
  setCycleStartDay,
  customDaysPerWeek,
  setCustomDaysPerWeek,
  customDayLabels,
  setCustomDayLabels,
  restDays,
  setRestDays,
  onNext,
}: {
  template: RoutineTemplate;
  cycleStartDay: DayOfWeek;
  setCycleStartDay: (d: DayOfWeek) => void;
  customDaysPerWeek: number;
  setCustomDaysPerWeek: (n: number) => void;
  customDayLabels: string[];
  setCustomDayLabels: (l: string[]) => void;
  restDays: DayOfWeek[];
  setRestDays: (d: DayOfWeek[]) => void;
  onNext: () => void;
}) {
  const isCustom = template.id === "custom";
  const requiredWorkoutDays = isCustom
    ? customDaysPerWeek
    : template.daysPerWeek;

  // Recalculate default rest days when cycle start day changes.
  // Places rest days at the END of the cycle (relative to the start day).
  const recalcRestDays = (startDay: DayOfWeek) => {
    const restCount = 7 - requiredWorkoutDays;
    if (restCount <= 0) {
      setRestDays([]);
      return;
    }
    const startIdx = DAYS_OF_WEEK.indexOf(startDay);
    const orderedWeek = [
      ...DAYS_OF_WEEK.slice(startIdx),
      ...DAYS_OF_WEEK.slice(0, startIdx),
    ];
    // Rest days go at the tail end of the ordered week
    const newRestDays = orderedWeek.slice(7 - restCount) as DayOfWeek[];
    setRestDays(newRestDays);
  };

  const handleCycleStartDayChange = (day: DayOfWeek) => {
    setCycleStartDay(day);
    // Auto-recalculate rest days for non-custom templates
    if (!isCustom) {
      recalcRestDays(day);
    }
  };

  const toggleRestDay = (day: DayOfWeek) => {
    if (restDays.includes(day)) {
      setRestDays(restDays.filter((d) => d !== day));
    } else {
      setRestDays([...restDays, day]);
    }
  };

  // Order days starting from the selected cycle start day
  const startIdx = DAYS_OF_WEEK.indexOf(cycleStartDay);
  const orderedDays = [
    ...DAYS_OF_WEEK.slice(startIdx),
    ...DAYS_OF_WEEK.slice(0, startIdx),
  ] as DayOfWeek[];

  const currentWorkoutDays = 7 - restDays.length;

  const handleNext = () => {
    if (!isCustom && currentWorkoutDays !== requiredWorkoutDays) {
      Alert.alert(
        "Invalid Day Configuration",
        `${template.name} requires exactly ${requiredWorkoutDays} workout day${requiredWorkoutDays !== 1 ? "s" : ""} and ${7 - requiredWorkoutDays} rest day${7 - requiredWorkoutDays !== 1 ? "s" : ""}. You currently have ${currentWorkoutDays} workout day${currentWorkoutDays !== 1 ? "s" : ""}.`,
      );
      return;
    }
    onNext();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={s.stepContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.stepTitle}>
          {isCustom ? "Custom Routine Setup" : `${template.name}`}
        </Text>

        {/* Cycle start day */}
        <Text style={s.fieldLabel}>Cycle Start Day</Text>
        <View style={s.dayGrid}>
          {DAYS_OF_WEEK.map((day) => (
            <TouchableOpacity
              key={day}
              style={[s.dayChip, cycleStartDay === day && s.dayChipActive]}
              onPress={() => handleCycleStartDayChange(day)}
            >
              <Text
                style={[
                  s.dayChipText,
                  cycleStartDay === day && s.dayChipTextActive,
                ]}
              >
                {day.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Workout / Rest days — shown for ALL templates */}
        <Text style={[s.fieldLabel, { marginTop: 20 }]}>
          Workout & Rest Days{" "}
          {!isCustom && (
            <Text style={{ color: ORANGE, textTransform: "none" }}>
              ({requiredWorkoutDays} workout / {7 - requiredWorkoutDays} rest
              required)
            </Text>
          )}
        </Text>
        {!isCustom && currentWorkoutDays !== requiredWorkoutDays && (
          <Text
            style={{
              color: "#E74C3C",
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            ⚠ Currently {currentWorkoutDays} workout day
            {currentWorkoutDays !== 1 ? "s" : ""} selected (need{" "}
            {requiredWorkoutDays})
          </Text>
        )}
        <View style={s.dayGrid}>
          {orderedDays.map((day) => {
            const isRest = restDays.includes(day);
            return (
              <TouchableOpacity
                key={day}
                style={[s.dayChip, isRest ? s.dayChipRest : s.dayChipWorkout]}
                onPress={() => toggleRestDay(day)}
              >
                <Text
                  style={[
                    s.dayChipText,
                    isRest ? { color: WHITE } : s.dayChipWorkoutText,
                  ]}
                >
                  {day.slice(0, 3)}
                </Text>
                <Text
                  style={{
                    color: isRest ? SUBTLE_TEXT : ORANGE,
                    fontSize: 9,
                    marginTop: 2,
                  }}
                >
                  {isRest ? "Rest" : "Workout"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom: how many days */}
        {isCustom && (
          <>
            <Text style={[s.fieldLabel, { marginTop: 20 }]}>
              Workout Days Per Week
            </Text>
            <View style={s.counterRow}>
              <TouchableOpacity
                style={s.counterBtn}
                onPress={() =>
                  setCustomDaysPerWeek(Math.max(1, customDaysPerWeek - 1))
                }
              >
                <MaterialIcons name="remove" size={20} color={WHITE} />
              </TouchableOpacity>
              <Text style={s.counterValue}>{customDaysPerWeek}</Text>
              <TouchableOpacity
                style={s.counterBtn}
                onPress={() =>
                  setCustomDaysPerWeek(Math.min(7, customDaysPerWeek + 1))
                }
              >
                <MaterialIcons name="add" size={20} color={WHITE} />
              </TouchableOpacity>
            </View>

            {/* Day labels */}
            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Day Labels</Text>
            {Array.from({ length: customDaysPerWeek }).map((_, i) => (
              <TextInput
                key={i}
                style={s.textInputRow}
                placeholder={`Day ${i + 1} label`}
                placeholderTextColor={SUBTLE_TEXT}
                value={customDayLabels[i] || ""}
                onChangeText={(val) => {
                  const copy = [...customDayLabels];
                  copy[i] = val;
                  setCustomDayLabels(copy);
                }}
              />
            ))}
          </>
        )}

        <TouchableOpacity style={s.primaryBtn} onPress={handleNext}>
          <Text style={s.primaryBtnText}>NEXT</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════
// STEP 2 — Configure Exercises per Day
// ══════════════════════════════════════════════════════

function StepDayExercises({
  days,
  setDays,
  onNext,
}: {
  days: RoutineDay[];
  setDays: (d: RoutineDay[]) => void;
  onNext: () => void;
}) {
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [copyMenuVisible, setCopyMenuVisible] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  const workoutDays = days.filter((d) => !d.isRest);
  const activeDay = workoutDays[activeDayIdx];

  const handleAddExercise = (item: ExerciseCatalogItem) => {
    const newEx: RoutineDayExercise = {
      id: nextRoutineExId(),
      catalogId: item.id,
      name: item.name,
      equipment: item.equipment,
      sets: 3,
      reps: "10",
    };
    const updated = days.map((d) => {
      if (d.label === activeDay.label && d.dayOfWeek === activeDay.dayOfWeek) {
        return { ...d, exercises: [...d.exercises, newEx] };
      }
      return d;
    });
    setDays(updated);
    setPickerVisible(false);
  };

  const handleRemoveExercise = (exId: string) => {
    const updated = days.map((d) => {
      if (d.label === activeDay.label && d.dayOfWeek === activeDay.dayOfWeek) {
        return { ...d, exercises: d.exercises.filter((e) => e.id !== exId) };
      }
      return d;
    });
    setDays(updated);
  };

  const handleUpdateExercise = (
    exId: string,
    field: "sets" | "reps",
    value: string,
  ) => {
    const updated = days.map((d) => {
      if (d.label === activeDay.label && d.dayOfWeek === activeDay.dayOfWeek) {
        return {
          ...d,
          exercises: d.exercises.map((e) => {
            if (e.id !== exId) return e;
            if (field === "sets") return { ...e, sets: parseInt(value) || 0 };
            return { ...e, reps: value };
          }),
        };
      }
      return d;
    });
    setDays(updated);
  };

  const handleReorderExercises = (reordered: RoutineDayExercise[]) => {
    const updated = days.map((d) => {
      if (d.label === activeDay.label && d.dayOfWeek === activeDay.dayOfWeek) {
        return { ...d, exercises: reordered };
      }
      return d;
    });
    setDays(updated);
  };

  const handleCopyFrom = (sourceDayIdx: number) => {
    const sourceDay = workoutDays[sourceDayIdx];
    if (!sourceDay || sourceDay.exercises.length === 0) {
      Alert.alert("Nothing to Copy", `${sourceDay.label} has no exercises.`);
      setCopyMenuVisible(false);
      return;
    }
    // Deep-copy exercises with new IDs so they are independent
    const copiedExercises: RoutineDayExercise[] = sourceDay.exercises.map(
      (ex) => ({
        ...ex,
        id: nextRoutineExId(),
      }),
    );
    const updated = days.map((d) => {
      if (d.label === activeDay.label && d.dayOfWeek === activeDay.dayOfWeek) {
        return { ...d, exercises: [...d.exercises, ...copiedExercises] };
      }
      return d;
    });
    setDays(updated);
    setCopyMenuVisible(false);
  };

  // Draggable render item (reorder mode only)
  const renderDraggableItem = (
    info: DragListRenderItemInfo<RoutineDayExercise>,
  ) => {
    const { item: ex, onDragStart, onDragEnd, isActive: isDragging } = info;
    return (
      <View
        style={[
          s.exerciseConfigCard,
          { marginHorizontal: 20, borderColor: ORANGE, borderWidth: 1 },
          isDragging && {
            elevation: 8,
            shadowColor: ORANGE,
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            transform: [{ scale: 1.03 }],
          },
        ]}
      >
        <View style={s.exerciseConfigHeader}>
          {/* Drag handle — only this triggers drag */}
          <TouchableOpacity
            onPressIn={onDragStart}
            onPressOut={onDragEnd}
            style={s.dragHandleWrap}
            activeOpacity={0.6}
          >
            <MaterialIcons
              name="drag-indicator"
              size={20}
              color={isDragging ? ORANGE : WHITE}
            />
            <Text style={s.exerciseConfigName}>{ex.name}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.exerciseConfigEquip, { marginLeft: 24 }]}>
          {ex.equipment}
        </Text>
      </View>
    );
  };

  // Normal (non-reorder) render item
  const renderNormalItem = ({ item: ex }: { item: RoutineDayExercise }) => (
    <View
      style={[
        s.exerciseConfigCard,
        { marginHorizontal: 20, borderColor: BORDER_COLOR, borderWidth: 1 },
      ]}
    >
      <View style={s.exerciseConfigHeader}>
        <Text style={s.exerciseConfigName}>{ex.name}</Text>
        <TouchableOpacity
          onPress={() => handleRemoveExercise(ex.id)}
          hitSlop={8}
        >
          <MaterialIcons name="close" size={18} color={SUBTLE_TEXT} />
        </TouchableOpacity>
      </View>
      <Text style={s.exerciseConfigEquip}>{ex.equipment}</Text>
      <View style={s.exerciseConfigRow}>
        <View style={s.exerciseConfigField}>
          <Text style={s.exerciseConfigLabel}>Sets</Text>
          <TextInput
            style={s.smallInput}
            value={String(ex.sets)}
            onChangeText={(v) => handleUpdateExercise(ex.id, "sets", v)}
            keyboardType="numeric"
          />
        </View>
        <View style={s.exerciseConfigField}>
          <Text style={s.exerciseConfigLabel}>Reps</Text>
          <TextInput
            style={[s.smallInput, { width: 80 }]}
            value={ex.reps}
            onChangeText={(v) => handleUpdateExercise(ex.id, "reps", v)}
          />
        </View>
      </View>
    </View>
  );

  // Determine which other workout days have exercises (for copy menu)
  const otherDaysWithExercises = workoutDays
    .map((d, i) => ({ ...d, origIdx: i }))
    .filter((d, i) => i !== activeDayIdx && d.exercises.length > 0);

  const listHeader = (
    <View style={[s.stepContent, { paddingBottom: 0 }]}>
      <Text style={s.stepTitle}>Configure Exercises</Text>
      <Text style={s.stepSubtitle}>
        {reorderMode
          ? "Drag exercises using the handle (⠿) to reorder. Tap Done when finished."
          : "Tap a day tab, then add exercises below."}
      </Text>

      {/* Day tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16, flexGrow: 0 }}
      >
        {workoutDays.map((d, i) => (
          <TouchableOpacity
            key={`${d.label}-${i}`}
            style={[s.dayTab, activeDayIdx === i && s.dayTabActive]}
            onPress={() => {
              setActiveDayIdx(i);
              setReorderMode(false);
            }}
          >
            <Text
              style={[s.dayTabText, activeDayIdx === i && s.dayTabTextActive]}
            >
              {d.label}
            </Text>
            <Text style={s.dayTabSub}>{d.dayOfWeek.slice(0, 3)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Reorder toggle (only show when there are 2+ exercises) */}
      {activeDay && activeDay.exercises.length >= 2 && (
        <TouchableOpacity
          style={[s.reorderToggleBtn, reorderMode && s.reorderToggleBtnActive]}
          onPress={() => setReorderMode(!reorderMode)}
        >
          <MaterialIcons
            name={reorderMode ? "check" : "swap-vert"}
            size={18}
            color={reorderMode ? WHITE : ORANGE}
          />
          <Text
            style={[
              s.reorderToggleText,
              reorderMode && s.reorderToggleTextActive,
            ]}
          >
            {reorderMode ? "Done Reordering" : "Reorder"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Empty state (only when no exercises) */}
      {(!activeDay || activeDay.exercises.length === 0) && (
        <View style={s.emptyDayBox}>
          <MaterialIcons name="fitness-center" size={32} color={BORDER_COLOR} />
          <Text style={s.emptyDayText}>No exercises yet</Text>
        </View>
      )}
    </View>
  );

  const listFooter = (
    <View style={s.stepContent}>
      {/* Add exercise + Copy from buttons */}
      <View style={s.dayActionsRow}>
        <TouchableOpacity
          style={[s.addExBtn, { flex: 1 }]}
          onPress={() => setPickerVisible(true)}
        >
          <MaterialIcons name="add" size={20} color={ORANGE} />
          <Text style={s.addExText}>Add Exercise</Text>
        </TouchableOpacity>

        {workoutDays.length > 1 && (
          <TouchableOpacity
            style={[s.addExBtn, { flex: 1 }]}
            onPress={() => {
              if (otherDaysWithExercises.length === 0) {
                Alert.alert(
                  "Nothing to Copy",
                  "Other days don't have any exercises yet.",
                );
              } else {
                setCopyMenuVisible(true);
              }
            }}
          >
            <MaterialIcons name="content-copy" size={18} color={ORANGE} />
            <Text style={s.addExText}>Copy From…</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[s.primaryBtn, { marginTop: 24 }]}
        onPress={onNext}
      >
        <Text style={s.primaryBtnText}>NEXT</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {reorderMode ? (
        <DragList
          data={activeDay?.exercises ?? []}
          keyExtractor={(item: RoutineDayExercise) => item.id}
          renderItem={renderDraggableItem}
          onReordered={async (fromIndex: number, toIndex: number) => {
            const copy = [...(activeDay?.exercises ?? [])];
            const removed = copy.splice(fromIndex, 1);
            copy.splice(toIndex, 0, removed[0]);
            handleReorderExercises(copy);
          }}
          ListHeaderComponent={listHeader}
          ListFooterComponent={<View style={{ height: 40 }} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      ) : (
        <FlatList
          data={activeDay?.exercises ?? []}
          keyExtractor={(item: RoutineDayExercise) => item.id}
          renderItem={renderNormalItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      <ExercisePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleAddExercise}
      />

      {/* Copy-from Day Picker Modal */}
      <Modal
        visible={copyMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCopyMenuVisible(false)}
      >
        <TouchableOpacity
          style={s.copyOverlay}
          activeOpacity={1}
          onPress={() => setCopyMenuVisible(false)}
        >
          <View style={s.copySheet}>
            <Text style={s.copySheetTitle}>
              Copy exercises to {activeDay?.label}
            </Text>
            <Text style={s.copySheetSubtitle}>
              Choose a day to copy exercises from
            </Text>
            {otherDaysWithExercises.map((d) => (
              <TouchableOpacity
                key={d.origIdx}
                style={s.copyDayRow}
                onPress={() => handleCopyFrom(d.origIdx)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.copyDayLabel}>
                    {d.label}{" "}
                    <Text style={s.copyDaySub}>
                      ({d.dayOfWeek.slice(0, 3)})
                    </Text>
                  </Text>
                  <Text style={s.copyDayMeta}>
                    {d.exercises.length} exercise
                    {d.exercises.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                <MaterialIcons name="content-copy" size={18} color={ORANGE} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={s.copyCancelBtn}
              onPress={() => setCopyMenuVisible(false)}
            >
              <Text style={s.copyCancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// STEP 3 — Warmup
// ══════════════════════════════════════════════════════

function StepWarmup({
  hasWarmup,
  setHasWarmup,
  warmupType,
  setWarmupType,
  warmupDuration,
  setWarmupDuration,
  onNext,
}: {
  hasWarmup: boolean;
  setHasWarmup: (v: boolean) => void;
  warmupType: WarmupType | undefined;
  setWarmupType: (t: WarmupType) => void;
  warmupDuration: string;
  setWarmupDuration: (d: string) => void;
  onNext: () => void;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={s.stepContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.stepTitle}>Warmup</Text>
        <Text style={s.stepSubtitle}>Do you warm up before your workout?</Text>

        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, hasWarmup && s.toggleBtnActive]}
            onPress={() => setHasWarmup(true)}
          >
            <Text style={[s.toggleBtnText, hasWarmup && s.toggleBtnTextActive]}>
              Yes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, !hasWarmup && s.toggleBtnActive]}
            onPress={() => setHasWarmup(false)}
          >
            <Text
              style={[s.toggleBtnText, !hasWarmup && s.toggleBtnTextActive]}
            >
              No
            </Text>
          </TouchableOpacity>
        </View>

        {hasWarmup && (
          <>
            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Warmup Type</Text>
            <View style={s.optionGrid}>
              {WARMUP_TYPES.map((w) => (
                <TouchableOpacity
                  key={w}
                  style={[s.optionChip, warmupType === w && s.optionChipActive]}
                  onPress={() => setWarmupType(w)}
                >
                  <Text
                    style={[
                      s.optionChipText,
                      warmupType === w && s.optionChipTextActive,
                    ]}
                  >
                    {w}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>
              Duration (minutes)
            </Text>
            <TextInput
              style={s.textInputRow}
              value={warmupDuration}
              onChangeText={setWarmupDuration}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor={SUBTLE_TEXT}
            />
          </>
        )}

        <TouchableOpacity
          style={[s.primaryBtn, { marginTop: 28 }]}
          onPress={onNext}
        >
          <Text style={s.primaryBtnText}>NEXT</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════
// STEP 4 — Cardio
// ══════════════════════════════════════════════════════

function StepCardio({
  hasCardio,
  setHasCardio,
  cardioType,
  setCardioType,
  segments,
  setSegments,
  onNext,
}: {
  hasCardio: boolean;
  setHasCardio: (v: boolean) => void;
  cardioType: CardioType | undefined;
  setCardioType: (t: CardioType) => void;
  segments: CardioSegment[];
  setSegments: (s: CardioSegment[]) => void;
  onNext: () => void;
}) {
  const isTreadmill = cardioType === "Treadmill";

  const addSegment = () => {
    const base: CardioSegment = { id: nextSegId(), durationMinutes: "" };
    if (isTreadmill) {
      base.speed = "";
      base.incline = "";
    } else {
      base.resistance = "";
    }
    setSegments([...segments, base]);
  };

  const updateSeg = (idx: number, field: keyof CardioSegment, val: string) => {
    setSegments(
      segments.map((seg, i) => (i === idx ? { ...seg, [field]: val } : seg)),
    );
  };

  const removeSeg = (idx: number) => {
    if (segments.length <= 1) return;
    setSegments(segments.filter((_, i) => i !== idx));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={s.stepContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.stepTitle}>Post-Workout Cardio</Text>
        <Text style={s.stepSubtitle}>Do you do cardio after your workout?</Text>

        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, hasCardio && s.toggleBtnActive]}
            onPress={() => setHasCardio(true)}
          >
            <Text style={[s.toggleBtnText, hasCardio && s.toggleBtnTextActive]}>
              Yes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, !hasCardio && s.toggleBtnActive]}
            onPress={() => setHasCardio(false)}
          >
            <Text
              style={[s.toggleBtnText, !hasCardio && s.toggleBtnTextActive]}
            >
              No
            </Text>
          </TouchableOpacity>
        </View>

        {hasCardio && (
          <>
            <Text style={[s.fieldLabel, { marginTop: 20 }]}>Cardio Type</Text>
            <View style={s.optionGrid}>
              {CARDIO_TYPES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.optionChip, cardioType === c && s.optionChipActive]}
                  onPress={() => {
                    setCardioType(c);
                    // reset segments when type changes
                    const base: CardioSegment = {
                      id: nextSegId(),
                      durationMinutes: "",
                    };
                    if (c === "Treadmill") {
                      base.speed = "";
                      base.incline = "";
                    } else {
                      base.resistance = "";
                    }
                    setSegments([base]);
                  }}
                >
                  <Text
                    style={[
                      s.optionChipText,
                      cardioType === c && s.optionChipTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {cardioType && (
              <>
                <Text style={[s.fieldLabel, { marginTop: 20 }]}>Segments</Text>

                {/* Column headers */}
                <View style={s.segHeaderRow}>
                  <Text style={[s.segColHeader, { width: 30 }]}>#</Text>
                  <Text style={[s.segColHeader, { flex: 1 }]}>Min</Text>
                  {isTreadmill ? (
                    <>
                      <Text style={[s.segColHeader, { flex: 1 }]}>Speed</Text>
                      <Text style={[s.segColHeader, { flex: 1 }]}>
                        Incline %
                      </Text>
                    </>
                  ) : (
                    <Text style={[s.segColHeader, { flex: 1 }]}>
                      Resistance
                    </Text>
                  )}
                  <View style={{ width: 24 }} />
                </View>

                {segments.map((seg, idx) => (
                  <View key={seg.id} style={s.segRow}>
                    <Text style={s.segNum}>{idx + 1}</Text>
                    <TextInput
                      style={[s.segInput, { flex: 1 }]}
                      value={seg.durationMinutes}
                      onChangeText={(v) => updateSeg(idx, "durationMinutes", v)}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#555"
                    />
                    {isTreadmill ? (
                      <>
                        <TextInput
                          style={[s.segInput, { flex: 1 }]}
                          value={seg.speed || ""}
                          onChangeText={(v) => updateSeg(idx, "speed", v)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor="#555"
                        />
                        <TextInput
                          style={[s.segInput, { flex: 1 }]}
                          value={seg.incline || ""}
                          onChangeText={(v) => updateSeg(idx, "incline", v)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor="#555"
                        />
                      </>
                    ) : (
                      <TextInput
                        style={[s.segInput, { flex: 1 }]}
                        value={seg.resistance || ""}
                        onChangeText={(v) => updateSeg(idx, "resistance", v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#555"
                      />
                    )}
                    <TouchableOpacity
                      onPress={() => removeSeg(idx)}
                      hitSlop={8}
                      style={{ width: 24, alignItems: "center" }}
                    >
                      <MaterialIcons
                        name="close"
                        size={16}
                        color={SUBTLE_TEXT}
                      />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={s.addSegBtn} onPress={addSegment}>
                  <Text style={s.addSegText}>ADD SEGMENT</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <TouchableOpacity
          style={[s.primaryBtn, { marginTop: 28 }]}
          onPress={onNext}
        >
          <Text style={s.primaryBtnText}>REVIEW & SAVE</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════
// STEP 5 — Summary
// ══════════════════════════════════════════════════════

function StepSummary({
  routineName,
  setRoutineName,
  template,
  cycleStartDay,
  days,
  hasWarmup,
  warmupType,
  warmupDuration,
  hasCardio,
  cardioType,
  segments,
  onSave,
  isEditMode,
  saving,
}: {
  routineName: string;
  setRoutineName: (v: string) => void;
  template: RoutineTemplate;
  cycleStartDay: DayOfWeek;
  days: RoutineDay[];
  hasWarmup: boolean;
  warmupType?: WarmupType;
  warmupDuration: string;
  hasCardio: boolean;
  cardioType?: CardioType;
  segments: CardioSegment[];
  onSave: () => void;
  isEditMode?: boolean;
  saving?: boolean;
}) {
  const workoutDays = days.filter((d) => !d.isRest);
  const restDays = days.filter((d) => d.isRest);
  const totalCardioMin = segments.reduce(
    (a, seg) => a + (parseInt(seg.durationMinutes) || 0),
    0,
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={s.stepContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.stepTitle}>Review Routine</Text>

        <Text style={s.fieldLabel}>Routine Name</Text>
        <TextInput
          style={s.textInputRow}
          value={routineName}
          onChangeText={setRoutineName}
          placeholder="My Routine"
          placeholderTextColor={SUBTLE_TEXT}
        />

        {/* Template info */}
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Template</Text>
          <Text style={s.summaryValue}>{template.name}</Text>
        </View>

        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Cycle Starts</Text>
          <Text style={s.summaryValue}>{cycleStartDay}</Text>
        </View>

        {/* Day breakdown */}
        <Text style={[s.fieldLabel, { marginTop: 16 }]}>Weekly Schedule</Text>
        {workoutDays.map((d, i) => (
          <View key={`${d.label}-${i}`} style={s.summaryDayRow}>
            <View style={s.summaryDayBadge}>
              <Text style={s.summaryDayBadgeText}>
                {d.dayOfWeek.slice(0, 3)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.summaryDayLabel}>{d.label}</Text>
              <Text style={s.summaryDayExCount}>
                {d.exercises.length} exercises
              </Text>
            </View>
          </View>
        ))}
        {restDays.map((d, i) => (
          <View key={`rest-${i}`} style={s.summaryDayRow}>
            <View style={[s.summaryDayBadge, { backgroundColor: "#2A2A2A" }]}>
              <Text style={[s.summaryDayBadgeText, { color: SUBTLE_TEXT }]}>
                {d.dayOfWeek.slice(0, 3)}
              </Text>
            </View>
            <Text style={[s.summaryDayLabel, { color: SUBTLE_TEXT }]}>
              Rest
            </Text>
          </View>
        ))}

        {/* Warmup */}
        <View style={[s.summaryCard, { marginTop: 16 }]}>
          <Text style={s.summaryLabel}>Warmup</Text>
          <Text style={s.summaryValue}>
            {hasWarmup ? `${warmupType} · ${warmupDuration} min` : "None"}
          </Text>
        </View>

        {/* Cardio */}
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Cardio</Text>
          <Text style={s.summaryValue}>
            {hasCardio
              ? `${cardioType} · ${segments.length} segment${segments.length > 1 ? "s" : ""} · ${totalCardioMin} min total`
              : "None"}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            s.primaryBtn,
            { marginTop: 28, backgroundColor: GREEN },
            saving && { opacity: 0.6 },
          ]}
          onPress={onSave}
          disabled={saving}
        >
          <Text style={s.primaryBtnText}>
            {saving
              ? "SAVING…"
              : isEditMode
                ? "UPDATE ROUTINE"
                : "SAVE ROUTINE"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════

export default function CreateRoutineScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routineId?: string }>();
  const editingRoutineId = params.routineId;

  // ── Loading state for edit mode (fetch routine from API) ──
  const [loading, setLoading] = useState(!!editingRoutineId);
  const [existingRoutine, setExistingRoutine] = useState<Routine | undefined>(
    undefined,
  );
  const [isEditMode, setIsEditMode] = useState(false);

  // When editing, skip the template selection (step 0) and start at step 1
  const [step, setStep] = useState<Step>(0);

  // State (defaults for create mode; overridden by useEffect for edit mode)
  const [routineName, setRoutineName] = useState("");
  const [template, setTemplate] = useState<RoutineTemplate | null>(null);
  const [cycleStartDay, setCycleStartDay] = useState<DayOfWeek>("Monday");
  const [customDaysPerWeek, setCustomDaysPerWeek] = useState(3);
  const [customDayLabels, setCustomDayLabels] = useState<string[]>([
    "Day 1",
    "Day 2",
    "Day 3",
  ]);
  const [restDays, setRestDays] = useState<DayOfWeek[]>(["Saturday", "Sunday"]);
  const [days, setDays] = useState<RoutineDay[]>([]);

  const [hasWarmup, setHasWarmup] = useState(false);
  const [warmupType, setWarmupType] = useState<WarmupType | undefined>(
    undefined,
  );
  const [warmupDuration, setWarmupDuration] = useState("5");

  const [hasCardio, setHasCardio] = useState(false);
  const [cardioType, setCardioType] = useState<CardioType | undefined>(
    undefined,
  );
  const [cardioSegments, setCardioSegments] = useState<CardioSegment[]>([
    { id: nextSegId(), durationMinutes: "" },
  ]);
  const [saving, setSaving] = useState(false);

  // ── Fetch existing routine for edit mode ──
  useEffect(() => {
    if (!editingRoutineId) return;

    (async () => {
      try {
        const res = await getRoutine(editingRoutineId);
        if (!res.ok) throw new Error("Failed to load routine");
        const json = await res.json();
        const routine: Routine = json.routine || json;

        setExistingRoutine(routine);
        setIsEditMode(true);
        setStep(1);

        // Populate state from existing routine
        setRoutineName(routine.name || "");
        const tpl =
          ROUTINE_TEMPLATES.find((t) => t.id === routine.templateId) || null;
        setTemplate(tpl);
        setCycleStartDay(routine.cycleStartDay || "Monday");

        const workoutDays = routine.days.filter((d: RoutineDay) => !d.isRest);
        setCustomDaysPerWeek(workoutDays.length);
        setCustomDayLabels(
          workoutDays.map((d: RoutineDay) => d.label) || [
            "Day 1",
            "Day 2",
            "Day 3",
          ],
        );
        setRestDays(
          routine.days
            .filter((d: RoutineDay) => d.isRest)
            .map((d: RoutineDay) => d.dayOfWeek),
        );
        // Map API exercises (exerciseId) → client format (id, catalogId)
        const mappedDays = routine.days.map((d: any) => ({
          ...d,
          exercises: (d.exercises || []).map((ex: any) => ({
            id: nextRoutineExId(),
            catalogId: ex.exerciseId || ex.catalogId || "",
            name: ex.name,
            equipment: ex.equipment || "",
            sets: ex.sets,
            reps: ex.reps,
          })),
        }));
        setDays(mappedDays);

        setHasWarmup(routine.hasWarmup || false);
        setWarmupType(routine.warmupType);
        setWarmupDuration(String(routine.warmupDurationMinutes || 5));

        setHasCardio(routine.hasCardio || false);
        setCardioType(routine.cardioType);
        if (routine.cardioSegments?.length) {
          setCardioSegments(routine.cardioSegments);
        }
      } catch {
        Alert.alert("Error", "Could not load routine for editing.");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRoutineId]);

  // ── Build days array when transitioning from step 1 → 2
  const buildDays = useCallback(() => {
    if (!template) return;
    const isCustom = template.id === "custom";
    const labels = isCustom
      ? customDayLabels.slice(0, customDaysPerWeek)
      : template.dayLabels;
    const startIdx = DAYS_OF_WEEK.indexOf(cycleStartDay);
    const orderedWeek = [
      ...DAYS_OF_WEEK.slice(startIdx),
      ...DAYS_OF_WEEK.slice(0, startIdx),
    ];

    const newDays: RoutineDay[] = [];
    let labelIdx = 0;

    for (const dayOfWeek of orderedWeek) {
      // For both custom and template routines, use restDays to determine rest/workout
      if (restDays.includes(dayOfWeek)) {
        newDays.push({ label: "Rest", isRest: true, dayOfWeek, exercises: [] });
      } else if (labelIdx >= labels.length) {
        // No more labels available — mark as rest
        newDays.push({ label: "Rest", isRest: true, dayOfWeek, exercises: [] });
      } else {
        // Preserve existing exercises if day already exists
        const existingDay = days.find(
          (d) => d.dayOfWeek === dayOfWeek && !d.isRest,
        );
        newDays.push({
          label: labels[labelIdx] || `Day ${labelIdx + 1}`,
          isRest: false,
          dayOfWeek,
          exercises: existingDay?.exercises || [],
        });
        labelIdx++;
      }
    }

    setDays(newDays);
  }, [
    template,
    cycleStartDay,
    customDaysPerWeek,
    customDayLabels,
    restDays,
    days,
  ]);

  const handleSelectTemplate = (t: RoutineTemplate) => {
    setTemplate(t);
    if (!routineName) {
      setRoutineName(t.id === "custom" ? "" : `My ${t.name}`);
    }
    if (t.id === "custom") {
      setCustomDayLabels(["Day 1", "Day 2", "Day 3"]);
      setCustomDaysPerWeek(3);
    } else {
      // For non-custom templates, set default rest days at the END of the cycle
      // relative to the current cycle start day
      const restCount = 7 - t.daysPerWeek;
      const startIdx = DAYS_OF_WEEK.indexOf(cycleStartDay);
      const orderedWeek = [
        ...DAYS_OF_WEEK.slice(startIdx),
        ...DAYS_OF_WEEK.slice(0, startIdx),
      ];
      const defaultRestDays = orderedWeek.slice(7 - restCount) as DayOfWeek[];
      setRestDays(defaultRestDays);
    }
    setStep(1);
  };

  const handleBack = () => {
    if (step === 0 || (isEditMode && step === 1)) {
      router.back();
    } else {
      setStep((step - 1) as Step);
    }
  };

  const stepTitles = isEditMode
    ? [
        "Choose Routine",
        "Configure",
        "Exercises",
        "Warmup",
        "Cardio",
        "Summary",
      ]
    : [
        "Choose Routine",
        "Configure",
        "Exercises",
        "Warmup",
        "Cardio",
        "Summary",
      ];

  // In edit mode, total steps = 5 (skip template selection step 0)
  const totalSteps = isEditMode ? 5 : 6;
  const displayStepNum = isEditMode ? step : step + 1;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: routineName || "Untitled Routine",
        templateId: template?.id || "custom",
        cycleStartDay,
        days: days.map((d) => ({
          label: d.label,
          isRest: d.isRest,
          dayOfWeek: d.dayOfWeek,
          exercises: d.exercises.map((ex) => ({
            exerciseId: ex.catalogId || ex.id,
            name: ex.name,
            equipment: ex.equipment,
            sets: ex.sets,
            reps: ex.reps,
          })),
        })),
        hasWarmup,
        warmupType: hasWarmup ? warmupType : undefined,
        warmupDurationMinutes: hasWarmup
          ? parseInt(warmupDuration) || 5
          : undefined,
        hasCardio,
        cardioType: hasCardio ? cardioType : undefined,
        cardioSegments: hasCardio
          ? cardioSegments.map((seg) => ({
              id: seg.id,
              durationMinutes: seg.durationMinutes,
              speed: seg.speed || "0",
              incline: seg.incline || "0",
            }))
          : undefined,
      };

      let res: Response;
      const routineMongoId =
        existingRoutine && (existingRoutine as any)._id
          ? (existingRoutine as any)._id
          : editingRoutineId;

      if (isEditMode && routineMongoId) {
        res = await apiUpdateRoutine(routineMongoId, payload);
      } else {
        res = await apiCreateRoutine(payload);
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err.error === "string"
            ? err.error
            : err.error?.message || `Failed to save routine (${res.status})`;
        throw new Error(msg);
      }

      const actionLabel = isEditMode ? "Updated" : "Created";
      const workoutDays = days.filter((d) => !d.isRest);
      const restCount = days.filter((d) => d.isRest).length;
      const totalCardioMin = cardioSegments.reduce(
        (a, seg) => a + (parseInt(seg.durationMinutes) || 0),
        0,
      );

      let summary = `Routine "${routineName || "Untitled"}" ${actionLabel.toLowerCase()}!\n\n`;
      summary += `📅 ${workoutDays.length} workout days, ${restCount} rest days\n\n`;
      workoutDays.forEach((d) => {
        summary += `• ${d.dayOfWeek.slice(0, 3)} — ${d.label}: ${d.exercises.length} exercise${d.exercises.length !== 1 ? "s" : ""}\n`;
      });
      summary += `\n🔥 Warmup: ${hasWarmup ? `${warmupType} (${warmupDuration} min)` : "None"}`;
      summary += `\n🏃 Cardio: ${hasCardio ? `${cardioType} · ${cardioSegments.length} segment${cardioSegments.length > 1 ? "s" : ""} · ${totalCardioMin} min` : "None"}`;

      Alert.alert(`Routine ${actionLabel}`, summary, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Could not save routine.");
    } finally {
      setSaving(false);
    }
  };

  // Show loading spinner while fetching routine in edit mode
  if (loading) {
    return (
      <SafeAreaView
        style={[
          s.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={{ color: SUBTLE_TEXT, marginTop: 16 }}>
          Loading routine…
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={WHITE} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {isEditMode && step === 1 ? "Edit Routine" : stepTitles[step]}
        </Text>
        <Text style={s.stepIndicator}>
          {displayStepNum}/{totalSteps}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={s.progressBar}>
        <View
          style={[
            s.progressFill,
            {
              width: `${(displayStepNum / totalSteps) * 100}%`,
            },
          ]}
        />
      </View>

      {step === 0 && !isEditMode && (
        <StepTemplate onSelect={handleSelectTemplate} />
      )}
      {step === 1 && template && (
        <StepCycleConfig
          template={template}
          cycleStartDay={cycleStartDay}
          setCycleStartDay={setCycleStartDay}
          customDaysPerWeek={customDaysPerWeek}
          setCustomDaysPerWeek={(n) => {
            setCustomDaysPerWeek(n);
            // Auto-extend labels
            const newLabels = [...customDayLabels];
            while (newLabels.length < n)
              newLabels.push(`Day ${newLabels.length + 1}`);
            setCustomDayLabels(newLabels.slice(0, n));
          }}
          customDayLabels={customDayLabels}
          setCustomDayLabels={setCustomDayLabels}
          restDays={restDays}
          setRestDays={setRestDays}
          onNext={() => {
            buildDays();
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <StepDayExercises
          days={days}
          setDays={setDays}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <StepWarmup
          hasWarmup={hasWarmup}
          setHasWarmup={setHasWarmup}
          warmupType={warmupType}
          setWarmupType={setWarmupType}
          warmupDuration={warmupDuration}
          setWarmupDuration={setWarmupDuration}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <StepCardio
          hasCardio={hasCardio}
          setHasCardio={setHasCardio}
          cardioType={cardioType}
          setCardioType={setCardioType}
          segments={cardioSegments}
          setSegments={setCardioSegments}
          onNext={() => setStep(5)}
        />
      )}
      {step === 5 && template && (
        <StepSummary
          routineName={routineName}
          setRoutineName={setRoutineName}
          template={template}
          cycleStartDay={cycleStartDay}
          days={days}
          hasWarmup={hasWarmup}
          warmupType={warmupType}
          warmupDuration={warmupDuration}
          hasCardio={hasCardio}
          cardioType={cardioType}
          segments={cardioSegments}
          onSave={handleSave}
          isEditMode={isEditMode}
          saving={saving}
        />
      )}
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  headerTitle: { color: WHITE, fontSize: 16, fontWeight: "600" },
  stepIndicator: { color: SUBTLE_TEXT, fontSize: 13 },
  progressBar: { height: 3, backgroundColor: BORDER_COLOR },
  progressFill: { height: 3, backgroundColor: ORANGE },
  stepContent: { padding: 20, paddingBottom: 60 },
  stepTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 6,
  },
  stepSubtitle: { color: SUBTLE_TEXT, fontSize: 14, marginBottom: 20 },

  // Template cards
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
  },
  templateName: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  templateDesc: {
    color: SUBTLE_TEXT,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  templateMeta: { color: ORANGE, fontSize: 12, fontWeight: "600" },

  // Field label
  fieldLabel: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  // Day grid
  dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: "center",
  },
  dayChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  dayChipRest: { backgroundColor: "#2A2A2A", borderColor: SUBTLE_TEXT },
  dayChipWorkout: { backgroundColor: "#1E2A1E", borderColor: GREEN },
  dayChipText: { color: SUBTLE_TEXT, fontSize: 13, fontWeight: "600" },
  dayChipTextActive: { color: WHITE },
  dayChipWorkoutText: { color: GREEN },

  // Counter
  counterRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  counterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    color: WHITE,
    fontSize: 24,
    fontWeight: "bold",
    minWidth: 30,
    textAlign: "center",
  },

  // Text input row
  textInputRow: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    color: WHITE,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  primaryBtnText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  // Toggle
  toggleRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  toggleBtnActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  toggleBtnText: { color: SUBTLE_TEXT, fontSize: 15, fontWeight: "600" },
  toggleBtnTextActive: { color: WHITE },

  // Option grid
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  optionChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  optionChipText: { color: SUBTLE_TEXT, fontSize: 13, fontWeight: "600" },
  optionChipTextActive: { color: WHITE },

  // Day tabs
  dayTab: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: "center",
  },
  dayTabActive: { borderColor: ORANGE, backgroundColor: "#1E1209" },
  dayTabText: { color: SUBTLE_TEXT, fontSize: 14, fontWeight: "600" },
  dayTabTextActive: { color: ORANGE },
  dayTabSub: { color: SUBTLE_TEXT, fontSize: 10, marginTop: 2 },

  // Exercise config card
  exerciseConfigCard: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  exerciseConfigHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  exerciseConfigName: { color: WHITE, fontSize: 15, fontWeight: "bold" },
  exerciseConfigEquip: { color: SUBTLE_TEXT, fontSize: 12, marginBottom: 10 },
  exerciseConfigRow: { flexDirection: "row", gap: 16 },
  exerciseConfigField: { flexDirection: "row", alignItems: "center", gap: 8 },
  exerciseConfigLabel: { color: SUBTLE_TEXT, fontSize: 12 },
  smallInput: {
    width: 52,
    height: 34,
    borderRadius: 6,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: "#3D2E1A",
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  // Empty day
  emptyDayBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 12,
    borderStyle: "dashed",
    marginBottom: 12,
  },
  emptyDayText: { color: SUBTLE_TEXT, fontSize: 14, marginTop: 8 },

  // Add exercise btn
  addExBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 10,
    borderStyle: "dashed",
    gap: 8,
  },
  addExText: { color: ORANGE, fontSize: 14, fontWeight: "600" },

  // Cardio segments
  segHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  segColHeader: {
    color: SUBTLE_TEXT,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  segRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  segNum: { color: WHITE, fontSize: 14, fontWeight: "600", width: 30 },
  segInput: {
    height: 36,
    borderRadius: 6,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: "#3D2E1A",
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 2,
  },
  addSegBtn: { alignItems: "center", paddingVertical: 10, marginTop: 4 },
  addSegText: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  // Summary
  summaryCard: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: { color: SUBTLE_TEXT, fontSize: 13 },
  summaryValue: { color: WHITE, fontSize: 14, fontWeight: "600" },
  summaryDayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
    gap: 12,
  },
  summaryDayBadge: {
    width: 42,
    height: 30,
    borderRadius: 6,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryDayBadgeText: { color: WHITE, fontSize: 12, fontWeight: "bold" },
  summaryDayLabel: { color: WHITE, fontSize: 14, fontWeight: "600" },
  summaryDayExCount: { color: SUBTLE_TEXT, fontSize: 12, marginTop: 1 },

  // Drag handle
  dragHandleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    paddingVertical: 4,
  },

  // Reorder toggle button
  reorderToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ORANGE,
    backgroundColor: "transparent",
    marginBottom: 12,
  },
  reorderToggleBtnActive: {
    backgroundColor: ORANGE,
  },
  reorderToggleText: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: "600",
  },
  reorderToggleTextActive: {
    color: WHITE,
  },

  // Day actions row (Add + Copy buttons)
  dayActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },

  // Copy-from modal
  copyOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  copySheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  copySheetTitle: {
    color: WHITE,
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 4,
  },
  copySheetSubtitle: {
    color: SUBTLE_TEXT,
    fontSize: 13,
    marginBottom: 20,
  },
  copyDayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  copyDayLabel: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "600",
  },
  copyDaySub: {
    color: SUBTLE_TEXT,
    fontWeight: "400",
  },
  copyDayMeta: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    marginTop: 2,
  },
  copyCancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  copyCancelText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    fontWeight: "600",
  },
});
