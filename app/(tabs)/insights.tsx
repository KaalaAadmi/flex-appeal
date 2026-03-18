import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getDeficitData, getProgression, getPlateaus } from "@/services/api";
import { syncHealthDataOnAppOpen } from "@/services/health";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const BORDER_COLOR = "#333";
const GREEN = "#2ECC71";
const RED = "#E74C3C";
const YELLOW = "#F39C12";

const CHART_HEIGHT = 200;
const BAR_WIDTH = 28;
const BAR_GAP = 4;

// ─── Types ───────────────────────────────────────────

interface DeficitEntry {
  date: string;
  label?: string;
  startDate?: string;
  endDate?: string;
  caloriesBurned: number;
  caloriesConsumed: number;
  caloriesFromMacros?: number;
  deficit: number;
  avgDailyDeficit?: number;
  steps?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  days?: number;
}

interface ProgressionExercise {
  exerciseId: string;
  name: string;
  equipment: string;
  sessions: {
    date: string;
    bestWeight: number;
    bestReps: number;
    totalVolume: number;
    sets: { weight: number; reps: number }[];
  }[];
}

interface PlateauEntry {
  exerciseName: string;
  equipment: string;
  staleWeight: number;
  staleSessions: number;
  lastSessionDate: string;
  suggestion: string;
}

// ─── Date Formatting Helpers ─────────────────────────

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseDateLabel(dateStr: string): {
  day: string;
  month: string;
  isFirstOfMonth: boolean;
  formatted: string;
} {
  if (!dateStr || !dateStr.includes("-")) {
    return {
      day: "",
      month: "",
      isFirstOfMonth: false,
      formatted: dateStr || "",
    };
  }
  const parts = dateStr.split("-");
  if (parts.length < 3) {
    return { day: "", month: "", isFirstOfMonth: false, formatted: dateStr };
  }
  const monthIdx = parseInt(parts[1], 10) - 1;
  const dayNum = parseInt(parts[2], 10);
  return {
    day: String(dayNum),
    month: MONTH_NAMES_SHORT[monthIdx] || parts[1],
    isFirstOfMonth: dayNum === 1,
    formatted: `${MONTH_NAMES_SHORT[monthIdx]} ${dayNum}`,
  };
}

function formatWeekLabel(_label: string, startDate?: string): string {
  if (startDate) {
    const parsed = parseDateLabel(startDate);
    return `${parsed.month} ${parsed.day}`;
  }
  const parts = _label.split("-");
  return parts[1] || _label;
}

function formatMonthLabel(label: string): string {
  const parts = label.split("-");
  const monthIdx = parseInt(parts[1], 10) - 1;
  const year = parts[0].slice(2);
  return `${MONTH_NAMES_SHORT[monthIdx]} '${year}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Mini Bar Chart Component ────────────────────────

type DeficitPeriod = "daily" | "weekly" | "monthly";

function BarChart({
  data,
  period,
  onBarPress,
}: {
  data: {
    label: string;
    rawDate: string;
    value: number;
    color: string;
    index: number;
    month?: string;
  }[];
  period: DeficitPeriod;
  onBarPress?: (index: number) => void;
}) {
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const chartWidth = data.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;

  let lastMonth = "";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 8 }}
    >
      <View style={{ width: chartWidth, height: CHART_HEIGHT + 36 }}>
        {/* Zero line */}
        <View style={[barStyles.zeroLine, { top: CHART_HEIGHT / 2 }]} />

        {/* Bars + labels */}
        <View style={barStyles.barContainer}>
          {data.map((d, i) => {
            const barHeight =
              (Math.abs(d.value) / maxVal) * (CHART_HEIGHT / 2 - 16);
            const isPositive = d.value >= 0;

            const currentMonth = d.month || "";
            const showMonthDivider =
              period === "daily" && currentMonth !== lastMonth && i > 0;
            if (currentMonth) lastMonth = currentMonth;

            return (
              <TouchableOpacity
                key={`${d.rawDate}-${i}`}
                style={[
                  barStyles.barWrap,
                  { width: BAR_WIDTH },
                  showMonthDivider && barStyles.monthDivider,
                ]}
                onPress={() => onBarPress?.(d.index)}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    position: "absolute",
                    bottom: isPositive ? CHART_HEIGHT / 2 : undefined,
                    top: isPositive ? undefined : CHART_HEIGHT / 2,
                    width: BAR_WIDTH - 6,
                    height: Math.max(barHeight, 2),
                    backgroundColor: d.color,
                    borderRadius: 3,
                  }}
                />

                <Text
                  style={[barStyles.barLabel, { top: CHART_HEIGHT + 2 }]}
                  numberOfLines={1}
                >
                  {d.label}
                </Text>

                {showMonthDivider && (
                  <Text
                    style={[barStyles.monthLabel, { top: CHART_HEIGHT + 16 }]}
                    numberOfLines={1}
                  >
                    {currentMonth}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const barStyles = StyleSheet.create({
  zeroLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: BORDER_COLOR,
  },
  barContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: CHART_HEIGHT,
    gap: BAR_GAP,
  },
  barWrap: {
    height: CHART_HEIGHT + 36,
    alignItems: "center",
    justifyContent: "center",
  },
  monthDivider: {
    borderLeftWidth: 1,
    borderLeftColor: SUBTLE_TEXT + "60",
  },
  barLabel: {
    position: "absolute",
    color: SUBTLE_TEXT,
    fontSize: 9,
    textAlign: "center",
    fontWeight: "500",
  },
  monthLabel: {
    position: "absolute",
    color: ORANGE,
    fontSize: 8,
    textAlign: "center",
    fontWeight: "700",
  },
});

// ─── Tooltip / Detail Popup for Deficit Bars ─────────

function DeficitTooltip({
  entry,
  period,
  goalType,
  onClose,
}: {
  entry: DeficitEntry;
  period: DeficitPeriod;
  goalType: string | null;
  onClose: () => void;
}) {
  const dateDisplay =
    period === "daily"
      ? formatFullDate(entry.date)
      : period === "weekly"
        ? entry.startDate && entry.endDate
          ? `${formatFullDate(entry.startDate)} – ${formatFullDate(entry.endDate)}`
          : entry.label || ""
        : formatMonthLabel(entry.label || entry.date);

  // Estimated fat loss for weekly view when user goal is fat loss (cut)
  const showEstFatLoss =
    period === "weekly" && goalType === "cut" && entry.deficit > 0;
  const estFatLossKg = showEstFatLoss ? entry.deficit / 7700 : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={tooltipStyles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={tooltipStyles.sheet}>
          <Text style={tooltipStyles.date}>{dateDisplay}</Text>
          {entry.days && entry.days > 1 && (
            <Text style={tooltipStyles.periodNote}>
              {entry.days} days
              {period === "weekly" || period === "monthly"
                ? " — showing totals"
                : ""}
            </Text>
          )}

          <View style={tooltipStyles.row}>
            <View style={tooltipStyles.statBox}>
              <Text style={[tooltipStyles.statValue, { color: GREEN }]}>
                {Math.round(entry.caloriesBurned).toLocaleString()}
              </Text>
              <Text style={tooltipStyles.statLabel}>Burned</Text>
            </View>
            <View style={tooltipStyles.statBox}>
              <Text style={[tooltipStyles.statValue, { color: RED }]}>
                {Math.round(entry.caloriesConsumed).toLocaleString()}
              </Text>
              <Text style={tooltipStyles.statLabel}>Consumed</Text>
            </View>
            <View style={tooltipStyles.statBox}>
              <Text
                style={[
                  tooltipStyles.statValue,
                  { color: entry.deficit >= 0 ? GREEN : RED },
                ]}
              >
                {entry.deficit >= 0 ? "+" : ""}
                {Math.round(entry.deficit).toLocaleString()}
              </Text>
              <Text style={tooltipStyles.statLabel}>Deficit</Text>
            </View>
          </View>

          {((entry.protein || 0) > 0 ||
            (entry.carbs || 0) > 0 ||
            (entry.fat || 0) > 0) && (
            <View style={tooltipStyles.macroRow}>
              <Text style={[tooltipStyles.macroItem, { color: "#4FC3F7" }]}>
                P: {(entry.protein || 0).toFixed(1)}g
              </Text>
              <Text style={[tooltipStyles.macroItem, { color: "#FFB74D" }]}>
                C: {(entry.carbs || 0).toFixed(1)}g
              </Text>
              <Text style={[tooltipStyles.macroItem, { color: "#E57373" }]}>
                F: {(entry.fat || 0).toFixed(1)}g
              </Text>
            </View>
          )}

          {(entry.steps || 0) > 0 && (
            <Text style={tooltipStyles.steps}>
              🚶 {entry.steps?.toLocaleString()} steps
            </Text>
          )}

          {showEstFatLoss && (
            <View style={tooltipStyles.fatLossRow}>
              <Text style={tooltipStyles.fatLossLabel}>🔥 Est. Fat Loss</Text>
              <Text style={[tooltipStyles.fatLossValue, { color: GREEN }]}>
                {estFatLossKg.toFixed(2)} kg
              </Text>
              <Text style={tooltipStyles.fatLossFormula}>
                {Math.round(entry.deficit).toLocaleString()} kcal ÷ 7,700
                kcal/kg
              </Text>
            </View>
          )}

          <TouchableOpacity style={tooltipStyles.closeBtn} onPress={onClose}>
            <Text style={tooltipStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const tooltipStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  sheet: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 340,
  },
  date: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
  },
  periodNote: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: DARK_BG,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 16, fontWeight: "bold", marginBottom: 2 },
  statLabel: { color: SUBTLE_TEXT, fontSize: 10 },
  macroRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 8,
  },
  macroItem: { fontSize: 13, fontWeight: "600" },
  steps: {
    color: SUBTLE_TEXT,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  fatLossRow: {
    alignItems: "center",
    backgroundColor: GREEN + "10",
    borderWidth: 1,
    borderColor: GREEN + "30",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  fatLossLabel: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  fatLossValue: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 2,
  },
  fatLossFormula: {
    color: SUBTLE_TEXT,
    fontSize: 10,
  },
  closeBtn: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: ORANGE,
    alignItems: "center",
  },
  closeBtnText: { color: WHITE, fontSize: 14, fontWeight: "bold" },
});

// ─── Single Exercise Line Chart (one chart per exercise) ──

const PROGRESSION_COLORS = [
  ORANGE,
  "#4FC3F7",
  "#81C784",
  "#FFB74D",
  "#CE93D8",
  "#F06292",
  "#4DB6AC",
  "#FF8A65",
];

function SingleExerciseChart({
  exercise,
  color,
  onPointPress,
}: {
  exercise: ProgressionExercise;
  color: string;
  onPointPress?: (sessionIdx: number) => void;
}) {
  if (exercise.sessions.length === 0) return null;

  const sessions = exercise.sessions;

  // Compute best volume (weight × reps) per session for the chart Y-axis
  const sessionVolumes = sessions.map((s) => {
    let bestVol = 0;
    let bestW = 0;
    let bestR = 0;
    for (const set of s.sets) {
      const vol = (set.weight || 0) * (set.reps || 0);
      if (vol > bestVol) {
        bestVol = vol;
        bestW = set.weight;
        bestR = set.reps;
      }
    }
    return { volume: bestVol, weight: bestW, reps: bestR };
  });

  let minV = Infinity;
  let maxV = -Infinity;
  for (const sv of sessionVolumes) {
    if (sv.volume < minV) minV = sv.volume;
    if (sv.volume > maxV) maxV = sv.volume;
  }
  if (minV === Infinity) minV = 0;
  if (maxV === -Infinity) maxV = 1;
  // Add 10% padding so dots don't touch edges
  const padding = (maxV - minV) * 0.1 || 1;
  const rangeMin = Math.max(0, minV - padding);
  const rangeMax = maxV + padding;
  const range = rangeMax - rangeMin || 1;

  const DOT_SIZE = 12;
  const POINT_GAP = 56;
  const chartWidth = sessions.length * POINT_GAP + 60;
  const chartH = 140;
  const paddingTop = 20;
  const paddingBottom = 10;
  const usableH = chartH - paddingTop - paddingBottom;

  const getY = (volume: number) =>
    paddingTop + usableH - ((volume - rangeMin) / range) * usableH;

  const points = sessions.map((s, i) => ({
    x: i * POINT_GAP + POINT_GAP / 2 + 40,
    y: getY(sessionVolumes[i].volume),
    sessionIdx: i,
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12 }}
    >
      <View style={{ width: chartWidth, height: chartH + 30 }}>
        {/* Y-axis labels */}
        <Text style={progStyles.yLabelTop}>{Math.round(rangeMax)}</Text>
        <Text style={progStyles.yLabelBottom}>{Math.round(rangeMin)}</Text>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <View
            key={frac}
            style={{
              position: "absolute",
              top: paddingTop + usableH * (1 - frac),
              left: 40,
              right: 0,
              height: StyleSheet.hairlineWidth,
              backgroundColor: BORDER_COLOR,
            }}
          />
        ))}

        {/* Connecting lines */}
        {points.map((pt, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);

          return (
            <View
              key={`line-${i}`}
              style={{
                position: "absolute",
                left: prev.x,
                top: prev.y,
                width: length,
                height: 2,
                backgroundColor: color + "80",
                transformOrigin: "left center",
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}

        {/* Dots (hollow circles) */}
        {points.map((pt, i) => (
          <TouchableOpacity
            key={`dot-${i}`}
            style={{
              position: "absolute",
              left: pt.x - DOT_SIZE / 2,
              top: pt.y - DOT_SIZE / 2,
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: DOT_SIZE / 2,
              borderWidth: 2.5,
              borderColor: color,
              backgroundColor: DARK_BG,
            }}
            onPress={() => onPointPress?.(pt.sessionIdx)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          />
        ))}

        {/* Weight × Reps labels on dots */}
        {points.map((pt, i) => (
          <Text
            key={`wt-${i}`}
            style={{
              position: "absolute",
              left: pt.x - 24,
              top: pt.y - 18,
              width: 48,
              textAlign: "center",
              color: SUBTLE_TEXT,
              fontSize: 8,
              fontWeight: "500",
            }}
          >
            {sessionVolumes[i].weight}×{sessionVolumes[i].reps}
          </Text>
        ))}

        {/* Date labels */}
        <View
          style={{
            flexDirection: "row",
            position: "absolute",
            top: chartH + 4,
            left: 40,
          }}
        >
          {sessions.map((s, i) => {
            const parsed = parseDateLabel(s.date);
            return (
              <View
                key={`dl-${i}`}
                style={{ width: POINT_GAP, alignItems: "center" }}
              >
                <Text style={progStyles.dateLabel}>{parsed.formatted}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const progStyles = StyleSheet.create({
  yLabelTop: {
    position: "absolute",
    top: 4,
    left: 0,
    color: SUBTLE_TEXT,
    fontSize: 10,
  },
  yLabelBottom: {
    position: "absolute",
    bottom: 34,
    left: 0,
    color: SUBTLE_TEXT,
    fontSize: 10,
  },
  dateLabel: {
    color: SUBTLE_TEXT,
    fontSize: 8,
    textAlign: "center",
  },
});

// ─── Main Insights Screen ────────────────────────────

export default function InsightsScreen() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [deficitLoading, setDeficitLoading] = useState(false);
  const [progressionLoading, setProgressionLoading] = useState(false);
  const [deficitPeriod, setDeficitPeriod] = useState<DeficitPeriod>("daily");
  const [deficitData, setDeficitData] = useState<DeficitEntry[]>([]);
  const [goalType, setGoalType] = useState<string | null>(null);
  const [macroGoals, setMacroGoals] = useState<{
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null>(null);
  const [progression, setProgression] = useState<ProgressionExercise[]>([]);
  const [progressionWeeks, setProgressionWeeks] = useState(8);
  const [plateaus, setPlateaus] = useState<PlateauEntry[]>([]);

  const [selectedDeficitIdx, setSelectedDeficitIdx] = useState<number | null>(
    null,
  );

  const [selectedSession, setSelectedSession] = useState<{
    exercise: string;
    color: string;
    date: string;
    sets: { weight: number; reps: number }[];
    bestWeight: number;
    bestReps: number;
    totalVolume: number;
  } | null>(null);

  const fetchDeficit = useCallback(
    async (period: DeficitPeriod, showSpinner = false) => {
      try {
        if (showSpinner) {
          setDeficitLoading(true);
          setDeficitData([]); // Clear old data to prevent stale-format crash
        }
        const res = await getDeficitData({ period });
        if (res.ok) {
          const json = await res.json();
          setDeficitData(json.data || []);
          setGoalType(json.goalType || null);
          setMacroGoals(json.macroGoals || null);
        }
      } catch (err) {
        console.warn("Failed to fetch deficit:", err);
      } finally {
        if (showSpinner) setDeficitLoading(false);
      }
    },
    [],
  );

  const fetchProgression = useCallback(
    async (weeks: number, showSpinner = false) => {
      try {
        if (showSpinner) setProgressionLoading(true);
        const res = await getProgression(weeks);
        if (res.ok) {
          const json = await res.json();
          setProgression(json.progression || []);
        }
      } catch (err) {
        console.warn("Failed to fetch progression:", err);
      } finally {
        if (showSpinner) setProgressionLoading(false);
      }
    },
    [],
  );

  const fetchPlateaus = useCallback(async () => {
    try {
      const res = await getPlateaus();
      if (res.ok) {
        const json = await res.json();
        setPlateaus(json.plateaus || []);
      }
    } catch (err) {
      console.warn("Failed to fetch plateaus:", err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setInitialLoading(true);
      // Sync latest health data from HealthKit, then fetch insights
      syncHealthDataOnAppOpen()
        .catch(() => {})
        .finally(() =>
          Promise.all([
            fetchDeficit(deficitPeriod),
            fetchProgression(progressionWeeks),
            fetchPlateaus(),
          ]).finally(() => setInitialLoading(false)),
        );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchDeficit, fetchProgression, fetchPlateaus]),
  );

  const handlePeriodChange = (period: DeficitPeriod) => {
    setDeficitPeriod(period);
    fetchDeficit(period, true);
  };

  const handleWeeksChange = (weeks: number) => {
    setProgressionWeeks(weeks);
    fetchProgression(weeks, true);
  };

  // Prepare deficit chart data with proper labels
  const deficitChartData = deficitData.map((d, i) => {
    const val = d.avgDailyDeficit ?? d.deficit;
    let label = "";
    let month = "";

    if (deficitPeriod === "daily") {
      const parsed = parseDateLabel(d.date);
      label = parsed.day;
      month = parsed.month;
    } else if (deficitPeriod === "weekly") {
      label = formatWeekLabel(d.label || "", d.startDate);
    } else {
      label = formatMonthLabel(d.label || d.date);
    }

    return {
      label,
      rawDate: d.date || d.startDate || "",
      value: val,
      color: val >= 0 ? GREEN : RED,
      index: i,
      month,
    };
  });

  // Compute summary stats
  const totalDeficit = deficitData.reduce(
    (sum, d) => sum + (d.deficit || 0),
    0,
  );
  const estimatedFatLossKg = totalDeficit / 7700;

  // Macro totals
  const totalProtein = deficitData.reduce(
    (sum, d) => sum + (d.protein || 0),
    0,
  );
  const totalCarbs = deficitData.reduce((sum, d) => sum + (d.carbs || 0), 0);
  const totalFat = deficitData.reduce((sum, d) => sum + (d.fat || 0), 0);
  const hasMacroData = totalProtein > 0 || totalCarbs > 0 || totalFat > 0;

  const daysWithMacros = deficitData.filter(
    (d) => (d.protein || 0) > 0 || (d.carbs || 0) > 0 || (d.fat || 0) > 0,
  ).length;
  const avgProtein =
    daysWithMacros > 0 ? Math.round(totalProtein / daysWithMacros) : 0;
  const avgCarbs =
    daysWithMacros > 0 ? Math.round(totalCarbs / daysWithMacros) : 0;
  const avgFat = daysWithMacros > 0 ? Math.round(totalFat / daysWithMacros) : 0;
  const avgMacroCalories = avgProtein * 4 + avgCarbs * 4 + avgFat * 9;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.pageTitle}>Insights</Text>

        {initialLoading ? (
          <ActivityIndicator
            color={ORANGE}
            size="large"
            style={{ marginTop: 60 }}
          />
        ) : (
          <>
            {/* ═══ PLATEAU ALERTS ═══ */}
            {plateaus.length > 0 && (
              <View style={s.alertCard}>
                <View style={s.alertHeader}>
                  <MaterialIcons
                    name="trending-flat"
                    size={20}
                    color={YELLOW}
                  />
                  <Text style={s.alertTitle}>Plateau Detected</Text>
                </View>
                {plateaus.map((p, i) => (
                  <View key={`plateau-${i}`} style={s.alertItem}>
                    <View style={s.alertIconWrap}>
                      <MaterialIcons
                        name="fitness-center"
                        size={14}
                        color={ORANGE}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertExName}>
                        {p.exerciseName}{" "}
                        <Text style={s.alertExEquip}>({p.equipment})</Text>
                      </Text>
                      <Text style={s.alertSuggestion}>{p.suggestion}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ═══ CALORIE DEFICIT SECTION ═══ */}
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <View>
                  <Text style={s.cardTitle}>Calorie Deficit</Text>
                  <Text style={s.cardSubtitle}>Tap any bar for details</Text>
                </View>
              </View>

              {/* Period Toggle */}
              <View style={s.periodToggle}>
                {(["daily", "weekly", "monthly"] as DeficitPeriod[]).map(
                  (p) => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        s.periodBtn,
                        deficitPeriod === p && s.periodBtnActive,
                      ]}
                      onPress={() => handlePeriodChange(p)}
                    >
                      <Text
                        style={[
                          s.periodBtnText,
                          deficitPeriod === p && s.periodBtnTextActive,
                        ]}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>

              {deficitData.length === 0 && !deficitLoading ? (
                <View style={s.emptyState}>
                  <MaterialIcons
                    name="show-chart"
                    size={36}
                    color={BORDER_COLOR}
                  />
                  <Text style={s.emptyText}>No calorie data yet</Text>
                  <Text style={s.emptySubtext}>
                    Connect Apple Health and MyFitnessPal in your Profile to
                    start tracking your calorie deficit.
                  </Text>
                </View>
              ) : deficitLoading ? (
                <ActivityIndicator
                  color={ORANGE}
                  size="small"
                  style={{ marginVertical: 40 }}
                />
              ) : (
                <>
                  {/* Fat Loss / Summary Card */}
                  {goalType === "cut" && totalDeficit > 0 ? (
                    <View style={s.fatLossCard}>
                      <View style={s.fatLossMain}>
                        <Text style={s.fatLossValue}>
                          {estimatedFatLossKg.toFixed(2)}
                        </Text>
                        <Text style={s.fatLossUnit}>kg</Text>
                      </View>
                      <Text style={s.fatLossLabel}>
                        Estimated fat loss in this period
                      </Text>
                      <Text style={s.fatLossFormula}>
                        {Math.round(totalDeficit).toLocaleString()} kcal deficit
                        ÷ 7,700 kcal/kg
                      </Text>
                    </View>
                  ) : (
                    <View style={s.statsRow}>
                      <View style={s.statBox}>
                        <Text
                          style={[
                            s.statValue,
                            { color: totalDeficit >= 0 ? GREEN : RED },
                          ]}
                        >
                          {totalDeficit >= 0 ? "+" : ""}
                          {Math.round(totalDeficit).toLocaleString()}
                        </Text>
                        <Text style={s.statLabel}>Net Deficit (kcal)</Text>
                      </View>
                      {totalDeficit !== 0 && (
                        <View style={s.statBox}>
                          <Text
                            style={[
                              s.statValue,
                              {
                                color: estimatedFatLossKg >= 0 ? GREEN : RED,
                              },
                            ]}
                          >
                            {estimatedFatLossKg >= 0 ? "" : "+"}
                            {Math.abs(estimatedFatLossKg).toFixed(2)} kg
                          </Text>
                          <Text style={s.statLabel}>
                            {estimatedFatLossKg >= 0
                              ? "Est. Fat Lost"
                              : "Est. Fat Gained"}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Bar Chart */}
                  <View style={s.chartContainer}>
                    <BarChart
                      data={deficitChartData}
                      period={deficitPeriod}
                      onBarPress={(idx) => setSelectedDeficitIdx(idx)}
                    />
                  </View>

                  <View style={s.legendRow}>
                    <View style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: GREEN }]} />
                      <Text style={s.legendText}>Deficit (burning more)</Text>
                    </View>
                    <View style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: RED }]} />
                      <Text style={s.legendText}>Surplus (eating more)</Text>
                    </View>
                  </View>

                  {/* Macro Breakdown — Goal vs Actual */}
                  {hasMacroData && (
                    <View style={s.macroSection}>
                      <View style={s.macroHeaderRow}>
                        <Text style={s.macroTitle}>Avg Daily Macros</Text>
                        <Text style={s.macroCalories}>
                          ≈ {avgMacroCalories.toLocaleString()} kcal/day
                        </Text>
                      </View>

                      <View style={s.macroBarContainer}>
                        {/* Protein */}
                        {avgProtein > 0 && (
                          <View style={s.macroBarRow}>
                            <Text style={[s.macroLabel, { color: "#4FC3F7" }]}>
                              Protein
                            </Text>
                            <View style={s.macroBarTrack}>
                              <View
                                style={[
                                  s.macroBarFill,
                                  {
                                    backgroundColor: "#4FC3F7",
                                    width: `${Math.min(
                                      macroGoals
                                        ? (avgProtein / macroGoals.protein) *
                                            100
                                        : ((avgProtein * 4) /
                                            avgMacroCalories) *
                                            100,
                                      100,
                                    )}%`,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={s.macroGrams}>
                              {avgProtein}
                              {macroGoals ? `/${macroGoals.protein}g` : "g"}
                            </Text>
                            {macroGoals && (
                              <Text
                                style={[
                                  s.macroPct,
                                  {
                                    color:
                                      avgProtein >= macroGoals.protein
                                        ? GREEN
                                        : ORANGE,
                                  },
                                ]}
                              >
                                {Math.round(
                                  (avgProtein / macroGoals.protein) * 100,
                                )}
                                %
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Carbs */}
                        {avgCarbs > 0 && (
                          <View style={s.macroBarRow}>
                            <Text style={[s.macroLabel, { color: "#FFB74D" }]}>
                              Carbs
                            </Text>
                            <View style={s.macroBarTrack}>
                              <View
                                style={[
                                  s.macroBarFill,
                                  {
                                    backgroundColor: "#FFB74D",
                                    width: `${Math.min(
                                      macroGoals
                                        ? (avgCarbs / macroGoals.carbs) * 100
                                        : ((avgCarbs * 4) / avgMacroCalories) *
                                            100,
                                      100,
                                    )}%`,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={s.macroGrams}>
                              {avgCarbs}
                              {macroGoals ? `/${macroGoals.carbs}g` : "g"}
                            </Text>
                            {macroGoals && (
                              <Text
                                style={[
                                  s.macroPct,
                                  {
                                    color:
                                      avgCarbs >= macroGoals.carbs
                                        ? GREEN
                                        : ORANGE,
                                  },
                                ]}
                              >
                                {Math.round(
                                  (avgCarbs / macroGoals.carbs) * 100,
                                )}
                                %
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Fat */}
                        {avgFat > 0 && (
                          <View style={s.macroBarRow}>
                            <Text style={[s.macroLabel, { color: "#E57373" }]}>
                              Fat
                            </Text>
                            <View style={s.macroBarTrack}>
                              <View
                                style={[
                                  s.macroBarFill,
                                  {
                                    backgroundColor: "#E57373",
                                    width: `${Math.min(
                                      macroGoals
                                        ? (avgFat / macroGoals.fat) * 100
                                        : ((avgFat * 9) / avgMacroCalories) *
                                            100,
                                      100,
                                    )}%`,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={s.macroGrams}>
                              {avgFat}
                              {macroGoals ? `/${macroGoals.fat}g` : "g"}
                            </Text>
                            {macroGoals && (
                              <Text
                                style={[
                                  s.macroPct,
                                  {
                                    color:
                                      avgFat <= macroGoals.fat ? GREEN : RED,
                                  },
                                ]}
                              >
                                {Math.round((avgFat / macroGoals.fat) * 100)}%
                              </Text>
                            )}
                          </View>
                        )}
                      </View>

                      <Text style={s.macroNote}>
                        {macroGoals
                          ? "Goal split: Protein from profile · Fat 25% of cals · Carbs remainder"
                          : "P: 4 kcal/g · C: 4 kcal/g · F: 9 kcal/g — Set goals in Profile for % tracking"}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ═══ WEIGHT PROGRESSION SECTION ═══ */}
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Exercise Progression</Text>
                  <Text style={s.cardSubtitle}>
                    Best set volume per session · Tap a point for details
                  </Text>
                </View>
                <View style={s.weekSelector}>
                  {[4, 8, 12].map((w) => (
                    <TouchableOpacity
                      key={w}
                      style={[
                        s.weekBtn,
                        progressionWeeks === w && s.weekBtnActive,
                      ]}
                      onPress={() => handleWeeksChange(w)}
                    >
                      <Text
                        style={[
                          s.weekBtnText,
                          progressionWeeks === w && s.weekBtnTextActive,
                        ]}
                      >
                        {w}w
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {progression.length === 0 && !progressionLoading ? (
                <View style={s.emptyState}>
                  <MaterialIcons
                    name="fitness-center"
                    size={36}
                    color={BORDER_COLOR}
                  />
                  <Text style={s.emptyText}>No workout data yet</Text>
                  <Text style={s.emptySubtext}>
                    Track workouts to see your strength progression over time.
                  </Text>
                </View>
              ) : progressionLoading ? (
                <ActivityIndicator
                  color={ORANGE}
                  size="small"
                  style={{ marginVertical: 40 }}
                />
              ) : (
                <View style={{ gap: 24 }}>
                  {progression.map((ex, idx) => {
                    if (ex.sessions.length === 0) return null;
                    const color =
                      PROGRESSION_COLORS[idx % PROGRESSION_COLORS.length];

                    // Find the PR by best single-set volume (weight × reps)
                    let prWeight = 0;
                    let prReps = 0;
                    let prVolume = 0;
                    for (const session of ex.sessions) {
                      for (const set of session.sets) {
                        const vol = (set.weight || 0) * (set.reps || 0);
                        if (vol > prVolume) {
                          prVolume = vol;
                          prWeight = set.weight;
                          prReps = set.reps;
                        }
                      }
                    }

                    return (
                      <View key={ex.exerciseId || ex.name}>
                        {/* Exercise header */}
                        <View style={s.exChartHeader}>
                          <View style={[s.prDot, { backgroundColor: color }]} />
                          <Text style={s.exChartName} numberOfLines={1}>
                            {ex.name}
                          </Text>
                          <Text style={s.exChartPr}>
                            PR: {prWeight} kg × {prReps}
                          </Text>
                        </View>

                        {ex.sessions.length < 2 ? (
                          <Text style={s.exChartNote}>
                            Only 1 session — needs more data to show a chart
                          </Text>
                        ) : (
                          <SingleExerciseChart
                            exercise={ex}
                            color={color}
                            onPointPress={(sessionIdx) => {
                              const session = ex.sessions[sessionIdx];
                              setSelectedSession({
                                exercise: ex.name,
                                color,
                                date: session.date,
                                sets: session.sets,
                                bestWeight: session.bestWeight,
                                bestReps: session.bestReps,
                                totalVolume: session.totalVolume,
                              });
                            }}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>

      {/* Deficit Tooltip Modal */}
      {selectedDeficitIdx !== null && deficitData[selectedDeficitIdx] && (
        <DeficitTooltip
          entry={deficitData[selectedDeficitIdx]}
          period={deficitPeriod}
          goalType={goalType}
          onClose={() => setSelectedDeficitIdx(null)}
        />
      )}

      {/* Session Detail Modal */}
      <Modal
        visible={!!selectedSession}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSession(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedSession(null)}
        >
          <View style={s.modalSheet}>
            {selectedSession && (
              <>
                <View style={s.modalTitleRow}>
                  <View
                    style={[
                      s.modalColorDot,
                      { backgroundColor: selectedSession.color },
                    ]}
                  />
                  <Text style={s.modalTitle}>{selectedSession.exercise}</Text>
                </View>
                <Text style={s.modalDate}>
                  {formatFullDate(selectedSession.date)}
                </Text>

                <View style={s.modalStatsRow}>
                  <View style={s.modalStatBox}>
                    <Text style={s.modalStatValue}>
                      {selectedSession.bestWeight} kg
                    </Text>
                    <Text style={s.modalStatLabel}>Best Weight</Text>
                  </View>
                  <View style={s.modalStatBox}>
                    <Text style={s.modalStatValue}>
                      {selectedSession.bestReps}
                    </Text>
                    <Text style={s.modalStatLabel}>Best Reps</Text>
                  </View>
                  <View style={s.modalStatBox}>
                    <Text style={s.modalStatValue}>
                      {selectedSession.totalVolume.toLocaleString()}
                    </Text>
                    <Text style={s.modalStatLabel}>Volume</Text>
                  </View>
                </View>

                <Text style={s.modalSetsTitle}>All Sets</Text>
                {selectedSession.sets.map((set, i) => (
                  <View key={i} style={s.modalSetRow}>
                    <Text style={s.modalSetNum}>Set {i + 1}</Text>
                    <Text style={s.modalSetVal}>
                      {set.weight} kg × {set.reps} reps
                    </Text>
                    <Text style={s.modalSetVol}>
                      {(set.weight * set.reps).toLocaleString()} vol
                    </Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={s.modalCloseBtn}
                  onPress={() => setSelectedSession(null)}
                >
                  <Text style={s.modalCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },
  pageTitle: {
    color: WHITE,
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },

  // Plateau Alert Card
  alertCard: {
    backgroundColor: YELLOW + "15",
    borderWidth: 1,
    borderColor: YELLOW + "40",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  alertTitle: {
    color: YELLOW,
    fontSize: 15,
    fontWeight: "bold",
  },
  alertItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  alertIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ORANGE + "20",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  alertExName: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
  },
  alertExEquip: {
    color: SUBTLE_TEXT,
    fontWeight: "400",
  },
  alertSuggestion: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },

  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  cardTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  cardSubtitle: { color: SUBTLE_TEXT, fontSize: 12 },

  // Period toggle
  periodToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: "center",
  },
  periodBtnActive: {
    borderColor: ORANGE,
    backgroundColor: ORANGE + "15",
  },
  periodBtnText: { color: SUBTLE_TEXT, fontSize: 13, fontWeight: "600" },
  periodBtnTextActive: { color: ORANGE },

  // Week selector
  weekSelector: { flexDirection: "row", gap: 6 },
  weekBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  weekBtnActive: { borderColor: ORANGE, backgroundColor: ORANGE + "15" },
  weekBtnText: { color: SUBTLE_TEXT, fontSize: 12, fontWeight: "600" },
  weekBtnTextActive: { color: ORANGE },

  // Fat Loss Card
  fatLossCard: {
    alignItems: "center",
    backgroundColor: GREEN + "10",
    borderWidth: 1,
    borderColor: GREEN + "30",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  fatLossMain: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  fatLossValue: {
    color: GREEN,
    fontSize: 36,
    fontWeight: "bold",
  },
  fatLossUnit: {
    color: GREEN,
    fontSize: 18,
    fontWeight: "600",
  },
  fatLossLabel: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  fatLossFormula: {
    color: SUBTLE_TEXT,
    fontSize: 11,
    marginTop: 4,
  },

  // Stats row
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginBottom: 16,
  },
  statBox: { alignItems: "center", flex: 1 },
  statValue: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  statLabel: { color: SUBTLE_TEXT, fontSize: 11 },

  // Chart
  chartContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },

  // Legend
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: SUBTLE_TEXT, fontSize: 11 },

  // Macro breakdown
  macroSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER_COLOR,
  },
  macroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  macroTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
  },
  macroCalories: {
    color: ORANGE,
    fontSize: 13,
    fontWeight: "600",
  },
  macroBarContainer: { gap: 10 },
  macroBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  macroLabel: {
    width: 52,
    fontSize: 12,
    fontWeight: "600",
  },
  macroBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: BORDER_COLOR,
    borderRadius: 4,
    overflow: "hidden",
  },
  macroBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  macroGrams: {
    color: WHITE,
    fontSize: 11,
    fontWeight: "500",
    width: 70,
    textAlign: "right",
  },
  macroPct: {
    fontSize: 12,
    fontWeight: "700",
    width: 38,
    textAlign: "right",
  },
  macroNote: {
    color: SUBTLE_TEXT,
    fontSize: 10,
    textAlign: "center",
    marginTop: 10,
    fontStyle: "italic",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 6,
  },
  emptySubtext: {
    color: SUBTLE_TEXT,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },

  // Per-exercise chart
  exChartHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  exChartName: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  exChartPr: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: "600",
  },
  exChartNote: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 4,
    paddingLeft: 16,
  },
  prDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  modalSheet: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 360,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  modalColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "bold",
  },
  modalDate: {
    color: SUBTLE_TEXT,
    fontSize: 13,
    marginBottom: 16,
  },
  modalStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    backgroundColor: DARK_BG,
    borderRadius: 10,
    padding: 12,
  },
  modalStatBox: { alignItems: "center", flex: 1 },
  modalStatValue: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  modalStatLabel: { color: SUBTLE_TEXT, fontSize: 10 },
  modalSetsTitle: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  modalSetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  modalSetNum: { color: SUBTLE_TEXT, fontSize: 13, width: 50 },
  modalSetVal: { color: WHITE, fontSize: 13, fontWeight: "500", flex: 1 },
  modalSetVol: { color: SUBTLE_TEXT, fontSize: 12 },
  modalCloseBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: ORANGE,
    alignItems: "center",
  },
  modalCloseBtnText: { color: WHITE, fontSize: 14, fontWeight: "bold" },
});
