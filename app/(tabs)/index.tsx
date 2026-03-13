import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useRef, useCallback } from "react";
import { Workout } from "@/data/mock-workouts";
import { Routine, DAYS_OF_WEEK, ROUTINE_TEMPLATES } from "@/data/routine-types";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import {
  getWorkouts,
  getRoutines,
  deleteRoutine,
  setRoutineActive,
} from "@/services/api";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const RED = "#E74C3C";
const BLUE = "#3498DB";

function formatShortDate(isoDate: string): string {
  const date = new Date(isoDate);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
}

function TabSwitcher({
  activeTab,
  onTabChange,
}: {
  activeTab: "Tracker" | "Routines";
  onTabChange: (tab: "Tracker" | "Routines") => void;
}) {
  const handlePress = (tab: "Tracker" | "Routines") => {
    if (tab !== activeTab) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onTabChange(tab);
  };

  return (
    <View style={styles.tabSwitcher}>
      <TouchableOpacity
        style={[styles.tab, activeTab === "Tracker" && styles.activeTab]}
        onPress={() => handlePress("Tracker")}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === "Tracker" && styles.activeTabText,
          ]}
        >
          Tracker
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === "Routines" && styles.activeTab]}
        onPress={() => handlePress("Routines")}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === "Routines" && styles.activeTabText,
          ]}
        >
          Routines
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function WorkoutCard({
  workout,
  onPress,
}: {
  workout: Workout;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.workoutCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {workout.title} {formatShortDate(workout.date)}
        </Text>
        <MaterialIcons name="chevron-right" size={20} color={SUBTLE_TEXT} />
      </View>

      {/* Type Badge */}
      <View style={styles.typeBadge}>
        <Text style={styles.typeBadgeText}>{workout.type}</Text>
      </View>

      {/* Exercise Names */}
      <Text style={styles.exerciseList} numberOfLines={2}>
        {workout.exerciseNames.join(", ")}
      </Text>

      {/* Divider */}
      <View style={styles.cardDivider} />

      {/* Stats Row */}
      <View style={styles.cardStatsRow}>
        <View style={styles.cardStatItem}>
          <Text style={styles.cardStatValue}>{workout.stats.workingSets}</Text>
          <Text style={styles.cardStatLabel}>Working Sets</Text>
        </View>
        <View style={styles.cardStatItem}>
          <Text style={styles.cardStatValue}>{workout.stats.duration}</Text>
          <Text style={styles.cardStatLabel}>Duration</Text>
        </View>
        <View style={styles.cardStatItem}>
          <Text style={[styles.cardStatValue, { color: ORANGE }]}>
            {workout.stats.estCalories}
          </Text>
          <Text style={styles.cardStatLabel}>Est Calories</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Swipeable Action Renderers ──────────────────────

function renderRightActionsDelete() {
  return (
    <View style={styles.swipeRightContainer}>
      <View style={styles.swipeActionDelete}>
        <MaterialIcons name="delete" size={22} color={WHITE} />
        <Text style={styles.swipeActionText}>Delete</Text>
      </View>
    </View>
  );
}

function renderLeftActionsEditToggle(
  isActive: boolean,
  onEdit: () => void,
  onToggleActive: () => void,
) {
  return (
    <View style={styles.swipeLeftContainer}>
      <TouchableOpacity style={styles.swipeActionEdit} onPress={onEdit}>
        <MaterialIcons name="edit" size={22} color={WHITE} />
        <Text style={styles.swipeActionText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.swipeActionToggle,
          isActive && styles.swipeActionToggleDeactivate,
        ]}
        onPress={onToggleActive}
      >
        <MaterialIcons
          name={isActive ? "star" : "star-outline"}
          size={22}
          color={WHITE}
        />
        <Text style={styles.swipeActionText}>
          {isActive ? "Deactivate" : "Set Active"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Swipeable Routine Card ──────────────────────────

function RoutineCard({
  routine,
  isActive,
  onStart,
  onDelete,
  onEdit,
  onToggleActive,
}: {
  routine: Routine;
  isActive: boolean;
  onStart: (routineId: string) => void;
  onDelete: (routineId: string) => void;
  onEdit: (routineId: string) => void;
  onToggleActive: (routineId: string) => void;
}) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const workoutDays = routine.days.filter((d) => !d.isRest);
  const restDays = routine.days.filter((d) => d.isRest);

  const handleDeleteSwipe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Delete Routine",
      `Are you sure you want to delete "${routine.name}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => swipeableRef.current?.close(),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            swipeableRef.current?.close();
            onDelete(routine.id);
          },
        },
      ],
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={() =>
        renderLeftActionsEditToggle(
          isActive,
          () => {
            swipeableRef.current?.close();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onEdit(routine.id);
          },
          () => {
            swipeableRef.current?.close();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onToggleActive(routine.id);
          },
        )
      }
      renderRightActions={() => renderRightActionsDelete()}
      onSwipeableOpen={(direction) => {
        if (direction === "right") {
          handleDeleteSwipe();
        }
      }}
      leftThreshold={60}
      rightThreshold={80}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      <View style={[styles.routineCard, isActive && styles.routineCardActive]}>
        {/* Header */}
        <View style={styles.routineCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.routineCardName}>{routine.name}</Text>
            <Text style={styles.routineCardTemplate}>
              {ROUTINE_TEMPLATES.find((t) => t.id === routine.templateId)
                ?.name || routine.templateId}
            </Text>
          </View>
          <View style={styles.routineHeaderBadges}>
            {isActive && (
              <View style={styles.activeBadge}>
                <MaterialIcons name="check-circle" size={12} color={WHITE} />
                <Text style={styles.activeBadgeText}>ACTIVE</Text>
              </View>
            )}
            <View style={styles.routineCycleBadge}>
              <Text style={styles.routineCycleBadgeText}>
                {routine.days.length}-day cycle
              </Text>
            </View>
          </View>
        </View>

        {/* Day pills */}
        <View style={styles.dayPillsRow}>
          {routine.days.map((day, idx) => (
            <View
              key={day.dayOfWeek + idx}
              style={[styles.dayPill, day.isRest && styles.dayPillRest]}
            >
              <Text
                style={[
                  styles.dayPillText,
                  day.isRest && styles.dayPillTextRest,
                ]}
              >
                {DAYS_OF_WEEK[idx]?.slice(0, 3) || `D${idx + 1}`}
              </Text>
            </View>
          ))}
        </View>

        {/* Info row */}
        <View style={styles.routineInfoRow}>
          <View style={styles.routineInfoItem}>
            <MaterialIcons
              name="fitness-center"
              size={14}
              color={SUBTLE_TEXT}
            />
            <Text style={styles.routineInfoText}>
              {workoutDays.length} workout days
            </Text>
          </View>
          <View style={styles.routineInfoItem}>
            <MaterialIcons name="hotel" size={14} color={SUBTLE_TEXT} />
            <Text style={styles.routineInfoText}>
              {restDays.length} rest days
            </Text>
          </View>
        </View>

        {/* Feature badges */}
        <View style={styles.routineFeatures}>
          {routine.hasWarmup && (
            <View style={styles.featureBadge}>
              <MaterialIcons name="self-improvement" size={12} color={ORANGE} />
              <Text style={styles.featureBadgeText}>
                {routine.warmupType} · {routine.warmupDurationMinutes}min
              </Text>
            </View>
          )}
          {routine.hasCardio && (
            <View style={styles.featureBadge}>
              <MaterialIcons name="directions-run" size={12} color={ORANGE} />
              <Text style={styles.featureBadgeText}>
                {routine.cardioType} · {routine.cardioSegments?.length || 0}{" "}
                segments
              </Text>
            </View>
          )}
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={styles.startRoutineBtn}
          activeOpacity={0.8}
          onPress={() => onStart(routine.id)}
        >
          <MaterialIcons name="play-arrow" size={18} color={WHITE} />
          <Text style={styles.startRoutineBtnText}>START WORKOUT</Text>
        </TouchableOpacity>

        {/* Swipe hint */}
        <Text style={styles.swipeHint}>← Swipe for actions →</Text>
      </View>
    </Swipeable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"Tracker" | "Routines">("Tracker");
  const [routines, setRoutinesState] = useState<Routine[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [workoutsRes, routinesRes] = await Promise.all([
        getWorkouts({ limit: 20 }),
        getRoutines(),
      ]);

      if (workoutsRes.ok) {
        const data = await workoutsRes.json();
        setWorkouts(data.workouts || []);
      }

      if (routinesRes.ok) {
        const data = await routinesRes.json();
        const fetchedRoutines: Routine[] = (data.routines || []).map(
          (r: Record<string, unknown>) => ({
            ...r,
            id: r.id || r._id,
          }),
        );
        setRoutinesState(fetchedRoutines);
        const active = fetchedRoutines.find(
          (r: Routine & { active?: boolean }) => r.active === true,
        );
        if (active) setActiveRoutineId(active.id);
      }
    } catch (err) {
      console.warn("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const handleStartRoutine = (routineId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/start-workout",
      params: { routineId, dayIndex: "0" },
    });
  };

  const handleDeleteRoutine = async (routineId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const res = await deleteRoutine(routineId);
      if (res.ok || res.status === 204) {
        setRoutinesState((prev) => prev.filter((r) => r.id !== routineId));
        if (activeRoutineId === routineId) {
          setActiveRoutineId(null);
        }
      }
    } catch {
      // Optimistic removal even if API fails
      setRoutinesState((prev) => prev.filter((r) => r.id !== routineId));
    }
  };

  const handleEditRoutine = (routineId: string) => {
    router.push({
      pathname: "/create-routine",
      params: { routineId },
    });
  };

  const handleToggleActive = async (routineId: string) => {
    const newActive = activeRoutineId !== routineId;
    try {
      await setRoutineActive(routineId, newActive);
      if (newActive) {
        setActiveRoutineId(routineId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setActiveRoutineId(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      // Optimistic toggle
      setActiveRoutineId(newActive ? routineId : null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Page Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.pageTitle}>Workouts</Text>
      </View>

      {/* Tab Switcher */}
      <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "Tracker" ? (
        <>
          {/* Track New Workout Button */}
          <TouchableOpacity
            style={styles.trackButton}
            activeOpacity={0.8}
            onPress={() => router.push("/track-workout")}
          >
            <MaterialIcons name="add" size={20} color={WHITE} />
            <Text style={styles.trackButtonText}>TRACK NEW WORKOUT</Text>
          </TouchableOpacity>

          {/* Workout History */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Workout History</Text>

            {loading ? (
              <ActivityIndicator
                color={ORANGE}
                size="large"
                style={{ marginTop: 40 }}
              />
            ) : workouts.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons
                  name="fitness-center"
                  size={48}
                  color={SUBTLE_TEXT}
                />
                <Text style={styles.emptyStateTitle}>No Workouts Yet</Text>
                <Text style={styles.emptyStateText}>
                  Track your first workout to see it here
                </Text>
              </View>
            ) : (
              workouts.map((workout: Workout) => (
                <WorkoutCard
                  key={workout.id}
                  workout={workout}
                  onPress={() => router.push(`/workout/${workout.id}`)}
                />
              ))
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      ) : (
        <>
          {/* Create New Routine Button */}
          <TouchableOpacity
            style={styles.trackButton}
            activeOpacity={0.8}
            onPress={() => router.push("/create-routine")}
          >
            <MaterialIcons name="add" size={20} color={WHITE} />
            <Text style={styles.trackButtonText}>CREATE NEW ROUTINE</Text>
          </TouchableOpacity>

          {/* Routines List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>My Routines</Text>

            {loading ? (
              <ActivityIndicator
                color={ORANGE}
                size="large"
                style={{ marginTop: 40 }}
              />
            ) : routines.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons
                  name="event-note"
                  size={48}
                  color={SUBTLE_TEXT}
                />
                <Text style={styles.emptyStateTitle}>No Routines Yet</Text>
                <Text style={styles.emptyStateText}>
                  Create your first workout routine to get started
                </Text>
              </View>
            ) : (
              routines.map((routine) => (
                <RoutineCard
                  key={routine.id}
                  routine={routine}
                  isActive={routine.id === activeRoutineId}
                  onStart={handleStartRoutine}
                  onDelete={handleDeleteRoutine}
                  onEdit={handleEditRoutine}
                  onToggleActive={handleToggleActive}
                />
              ))
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  titleContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  pageTitle: {
    color: WHITE,
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
  },
  tabSwitcher: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#333",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: CARD_BG,
  },
  activeTab: {
    backgroundColor: DARK_BG,
    borderBottomWidth: 2,
    borderBottomColor: ORANGE,
  },
  tabText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    fontWeight: "600",
  },
  activeTabText: {
    color: WHITE,
  },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ORANGE,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  trackButtonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  workoutCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
  },
  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#2A2A2A",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  typeBadgeText: {
    color: ORANGE,
    fontSize: 11,
    fontWeight: "600",
  },
  exerciseList: {
    color: SUBTLE_TEXT,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#333",
    marginBottom: 12,
  },
  cardStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardStatItem: {
    alignItems: "center",
    flex: 1,
  },
  cardStatValue: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  cardStatLabel: {
    color: SUBTLE_TEXT,
    fontSize: 11,
  },

  // ─── Routine Card Styles ─────────────────────
  routineCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
  },
  routineCardActive: {
    borderLeftColor: GREEN,
    borderWidth: 1,
    borderColor: GREEN + "40",
  },
  routineCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  routineHeaderBadges: {
    alignItems: "flex-end",
    gap: 6,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GREEN,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  routineCardName: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  routineCardTemplate: {
    color: SUBTLE_TEXT,
    fontSize: 12,
  },
  routineCycleBadge: {
    backgroundColor: "#2A2A2A",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  routineCycleBadgeText: {
    color: ORANGE,
    fontSize: 11,
    fontWeight: "600",
  },

  // Day pills
  dayPillsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  dayPill: {
    width: 36,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#2A2019",
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillRest: {
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#333",
  },
  dayPillText: {
    color: ORANGE,
    fontSize: 10,
    fontWeight: "bold",
  },
  dayPillTextRest: {
    color: SUBTLE_TEXT,
  },

  // Info row
  routineInfoRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
  },
  routineInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  routineInfoText: {
    color: SUBTLE_TEXT,
    fontSize: 12,
  },

  // Feature badges
  routineFeatures: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  featureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2A2019",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featureBadgeText: {
    color: ORANGE,
    fontSize: 11,
    fontWeight: "600",
  },

  // Start routine button
  startRoutineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ORANGE,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  startRoutineBtnText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 6,
  },
  emptyStateText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
    textAlign: "center",
  },

  // ─── Swipeable Action Styles ─────────────────
  swipeRightContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderRadius: 12,
    overflow: "hidden",
  },
  swipeLeftContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderRadius: 12,
    overflow: "hidden",
  },
  swipeActionDelete: {
    backgroundColor: RED,
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    height: "100%",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  swipeActionEdit: {
    backgroundColor: BLUE,
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    height: "100%",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  swipeActionToggle: {
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
    width: 90,
    height: "100%",
  },
  swipeActionToggleDeactivate: {
    backgroundColor: SUBTLE_TEXT,
  },
  swipeActionText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 4,
  },
  swipeHint: {
    color: SUBTLE_TEXT,
    fontSize: 10,
    textAlign: "center",
    marginTop: 8,
    opacity: 0.5,
  },
});
