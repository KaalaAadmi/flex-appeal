import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useState, useEffect, useRef } from "react";
import { Audio } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Notifications from "expo-notifications";
import { Routine, RoutineDay } from "@/data/routine-types";
import { getRoutine, createWorkout } from "@/services/api";
import { getCumulativeActiveCalories } from "@/services/health";

// ─── Theme Constants ─────────────────────────────────

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const BORDER_COLOR = "#333";
const GREEN = "#2ECC71";
const RED = "#E74C3C";
const YELLOW = "#F39C12";

type Phase = "warmup" | "workout" | "cardio" | "done";

// ─── Timer Hook (wall-clock based — survives backgrounding) ──

function useTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0); // wall-clock ms
  const accumulatedRef = useRef<number>(0); // seconds banked before last pause

  useEffect(() => {
    if (running) {
      startedAtRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setSeconds(accumulatedRef.current + elapsed);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const start = () => setRunning(true);
  const pause = () => {
    // Bank the elapsed time
    accumulatedRef.current =
      accumulatedRef.current +
      Math.floor((Date.now() - startedAtRef.current) / 1000);
    setRunning(false);
  };
  const reset = () => {
    setRunning(false);
    accumulatedRef.current = 0;
    setSeconds(0);
  };

  return { seconds, running, start, pause, reset };
}

function formatTime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// Custom tone, bundled asset (user-provided mp3)
const TONE_ASSET = require("@/assets/sounds/tone.mp3");

// ─── Notification helper ───────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }
}

/**
 * Schedule a notification to fire after `delaySec` seconds.
 * When delaySec === 0, fires immediately (trigger: null).
 * Returns the notification identifier so it can be cancelled.
 */
async function scheduleNotification(
  title: string,
  body: string,
  delaySec: number = 0,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: "tone.mp3" },
    trigger:
      delaySec > 0
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySec,
            repeats: false,
          }
        : null,
  });
}

/**
 * Cancel a previously scheduled notification by its identifier.
 */
async function cancelScheduledNotification(id: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* ignore */
  }
}

// ─── Countdown Timer Hook (wall-clock based) ─────────

function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [bellRung, setBellRung] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef<number>(0);
  const onCompleteRef = useRef<(() => void) | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const playTone = async () => {
    try {
      // Duck other audio (e.g. music) so the tone stands out
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 2, // InterruptionModeIOS.DuckOthers
        shouldDuckAndroid: true,
        interruptionModeAndroid: 2, // InterruptionModeAndroid.DuckOthers
      });
      const { sound } = await Audio.Sound.createAsync(TONE_ASSET, {
        shouldPlay: false,
        volume: 0.8,
        isLooping: false,
      });
      soundRef.current = sound;
      await sound.playAsync();
      // Auto-unload after playback, then restore audio mode so other apps resume
      setTimeout(async () => {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
          soundRef.current = null;
          // Restore mixing so the user's music returns to full volume
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            interruptionModeIOS: 1, // InterruptionModeIOS.MixWithOthers
            shouldDuckAndroid: false,
            interruptionModeAndroid: 1, // InterruptionModeAndroid.DoNotMix → actually MixWithOthers = 1
          });
        } catch {
          /* ignore */
        }
      }, 1200);
    } catch (err) {
      console.warn("Could not play countdown tone:", err);
    }
  };

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const left = Math.max(0, Math.ceil((endAtRef.current - now) / 1000));
        setRemaining(left);

        if (left <= 10 && left > 0 && !bellRung) {
          playTone();
          setBellRung(true);
        }

        if (left <= 0) {
          setRunning(false);
          if (onCompleteRef.current) onCompleteRef.current();
        }
      }, 250);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, bellRung]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const startCountdown = (totalSeconds: number, onComplete: () => void) => {
    endAtRef.current = Date.now() + totalSeconds * 1000;
    setRemaining(totalSeconds);
    setBellRung(false);
    onCompleteRef.current = onComplete;
    setRunning(true);
  };

  const pause = () => {
    const now = Date.now();
    const left = Math.max(0, Math.ceil((endAtRef.current - now) / 1000));
    setRemaining(left);
    setRunning(false);
  };

  const resume = () => {
    endAtRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  };

  return { remaining, running, startCountdown, pause, resume };
}

// ─── Warmup Phase ────────────────────────────────────

function WarmupPhase({
  routine,
  onSkip,
  onComplete,
}: {
  routine: Routine;
  onSkip: () => void;
  onComplete: () => void;
}) {
  const timer = useTimer();
  const targetSeconds = (routine.warmupDurationMinutes || 5) * 60;
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    setStarted(true);
    timer.start();
  };

  const progress = Math.min(timer.seconds / targetSeconds, 1);

  return (
    <View style={p.phaseContainer}>
      <View style={p.phaseIconCircle}>
        <MaterialIcons name="self-improvement" size={40} color={ORANGE} />
      </View>
      <Text style={p.phaseTitle}>Warmup</Text>
      <Text style={p.phaseSubtitle}>
        {routine.warmupType} · {routine.warmupDurationMinutes} min
      </Text>

      {/* Timer display */}
      <Text style={p.bigTimer}>{formatTime(timer.seconds)}</Text>
      <Text style={p.targetText}>Target: {formatTime(targetSeconds)}</Text>

      {/* Progress bar */}
      <View style={p.progressBarOuter}>
        <View style={[p.progressBarInner, { width: `${progress * 100}%` }]} />
      </View>

      {!started ? (
        <View style={p.btnRow}>
          <TouchableOpacity style={p.skipBtn} onPress={onSkip}>
            <Text style={p.skipBtnText}>SKIP WARMUP</Text>
          </TouchableOpacity>
          <TouchableOpacity style={p.startBtn} onPress={handleStart}>
            <MaterialIcons name="play-arrow" size={20} color={WHITE} />
            <Text style={p.startBtnText}>START WARMUP</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={p.btnRow}>
          {timer.running ? (
            <TouchableOpacity style={p.pauseBtn} onPress={timer.pause}>
              <MaterialIcons name="pause" size={20} color={WHITE} />
              <Text style={p.pauseBtnText}>PAUSE</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={p.startBtn} onPress={timer.start}>
              <MaterialIcons name="play-arrow" size={20} color={WHITE} />
              <Text style={p.startBtnText}>RESUME</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={p.completeBtn} onPress={onComplete}>
            <MaterialIcons name="check" size={20} color={WHITE} />
            <Text style={p.completeBtnText}>DONE</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Workout Phase ───────────────────────────────────

interface WorkoutSetEntry {
  weight: string;
  reps: string;
  completed: boolean;
}

interface WorkoutExerciseEntry {
  name: string;
  equipment: string;
  targetSets: number;
  targetReps: string;
  sets: WorkoutSetEntry[];
}

function WorkoutPhase({
  routine,
  todayDay,
  onComplete,
}: {
  routine: Routine;
  todayDay: RoutineDay;
  onComplete: () => void;
}) {
  const timer = useTimer();
  const [started, setStarted] = useState(false);
  const [exercises, setExercises] = useState<WorkoutExerciseEntry[]>(() =>
    todayDay.exercises.map((ex) => ({
      name: ex.name,
      equipment: ex.equipment,
      targetSets: ex.sets,
      targetReps: ex.reps,
      sets: Array.from({ length: ex.sets }, () => ({
        weight: "",
        reps: "",
        completed: false,
      })),
    })),
  );

  const allCompleted = exercises.every((ex) =>
    ex.sets.every((s) => s.completed),
  );
  const totalCompleted = exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0,
  );
  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.length, 0);

  const handleStart = () => {
    setStarted(true);
    timer.start();
  };

  const handleToggleSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, ei) => {
        if (ei !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, si) => {
            if (si !== setIdx) return s;
            return { ...s, completed: !s.completed };
          }),
        };
      }),
    );
  };

  const handleUpdateSet = (
    exIdx: number,
    setIdx: number,
    field: "weight" | "reps",
    val: string,
  ) => {
    setExercises((prev) =>
      prev.map((ex, ei) => {
        if (ei !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, si) => {
            if (si !== setIdx) return s;
            return { ...s, [field]: val };
          }),
        };
      }),
    );
  };

  const handleFinish = () => {
    timer.pause();
    onComplete();
  };

  if (!started) {
    return (
      <View style={p.phaseContainer}>
        <View style={p.phaseIconCircle}>
          <MaterialIcons name="fitness-center" size={40} color={ORANGE} />
        </View>
        <Text style={p.phaseTitle}>{todayDay.label}</Text>
        <Text style={p.phaseSubtitle}>
          {todayDay.exercises.length} exercises · {totalSets} sets
        </Text>
        <TouchableOpacity
          style={[p.startBtn, { marginTop: 30 }]}
          onPress={handleStart}
        >
          <MaterialIcons name="play-arrow" size={20} color={WHITE} />
          <Text style={p.startBtnText}>START WORKOUT</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Timer & progress bar */}
      <View style={p.workoutHeader}>
        <View>
          <Text style={p.workoutTimerLabel}>Elapsed</Text>
          <Text style={p.workoutTimer}>{formatTime(timer.seconds)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={p.workoutTimerLabel}>Progress</Text>
          <Text style={p.workoutProgress}>
            {totalCompleted}/{totalSets} sets
          </Text>
        </View>
      </View>

      <View style={[p.progressBarOuter, { marginBottom: 20 }]}>
        <View
          style={[
            p.progressBarInner,
            {
              width: `${totalSets > 0 ? (totalCompleted / totalSets) * 100 : 0}%`,
            },
          ]}
        />
      </View>

      {/* Exercise cards */}
      {exercises.map((ex, exIdx) => (
        <View key={`${ex.name}-${exIdx}`} style={p.exerciseCard}>
          <Text style={p.exerciseCardName}>
            {ex.name} ({ex.equipment})
          </Text>
          <Text style={p.exerciseCardTarget}>
            Target: {ex.targetSets} × {ex.targetReps}
          </Text>

          {/* Column headers */}
          <View style={p.colHeaders}>
            <Text style={[p.colHeader, { width: 30 }]}>Set</Text>
            <Text style={[p.colHeader, { flex: 1, textAlign: "center" }]}>
              Weight
            </Text>
            <Text style={[p.colHeader, { flex: 1, textAlign: "center" }]}>
              Reps
            </Text>
            <View style={{ width: 36 }} />
          </View>

          {ex.sets.map((set, setIdx) => (
            <View
              key={setIdx}
              style={[p.workoutSetRow, set.completed && p.workoutSetRowDone]}
            >
              <Text style={[p.setNum, set.completed && { color: GREEN }]}>
                {setIdx + 1}
              </Text>
              <TextInput
                style={[p.setInput, set.completed && p.setInputDone]}
                value={set.weight}
                onChangeText={(v) =>
                  handleUpdateSet(exIdx, setIdx, "weight", v)
                }
                keyboardType="numeric"
                placeholder="kg"
                placeholderTextColor="#555"
                editable={!set.completed}
              />
              <TextInput
                style={[p.setInput, set.completed && p.setInputDone]}
                value={set.reps}
                onChangeText={(v) => handleUpdateSet(exIdx, setIdx, "reps", v)}
                keyboardType="numeric"
                placeholder="reps"
                placeholderTextColor="#555"
                editable={!set.completed}
              />
              <TouchableOpacity
                style={[p.checkBtn, set.completed && p.checkBtnDone]}
                onPress={() => handleToggleSet(exIdx, setIdx)}
              >
                <MaterialIcons
                  name={
                    set.completed ? "check-circle" : "radio-button-unchecked"
                  }
                  size={22}
                  color={set.completed ? GREEN : SUBTLE_TEXT}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ))}

      {/* Finish */}
      <TouchableOpacity
        style={[
          p.completeBtn,
          { marginTop: 20, opacity: allCompleted ? 1 : 0.5 },
        ]}
        onPress={handleFinish}
        disabled={!allCompleted}
      >
        <MaterialIcons name="check" size={20} color={WHITE} />
        <Text style={p.completeBtnText}>FINISH WORKOUT</Text>
      </TouchableOpacity>

      {!allCompleted && (
        <Text style={p.hintText}>Complete all sets to finish the workout</Text>
      )}
    </ScrollView>
  );
}

// ─── Cardio Phase ────────────────────────────────────

function CardioPhase({
  routine,
  onComplete,
}: {
  routine: Routine;
  onComplete: () => void;
}) {
  const segments = routine.cardioSegments || [];
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [segmentsDone, setSegmentsDone] = useState<boolean[]>(
    segments.map(() => false),
  );
  const countdown = useCountdown();

  const isTreadmill = routine.cardioType === "Treadmill";
  const allDone = segmentsDone.every(Boolean);
  const warningZone = countdown.remaining <= 10 && countdown.remaining > 0;

  // Keep screen awake while cardio is active
  useEffect(() => {
    if (sessionStarted) {
      activateKeepAwakeAsync("cardio-timer");
    }
    return () => {
      deactivateKeepAwake("cardio-timer");
    };
  }, [sessionStarted]);

  // Track scheduled notification IDs so we can cancel on early exit
  const scheduledNotifIds = useRef<string[]>([]);

  // Start a specific segment's countdown and auto-chain to the next one
  const kickOffSegment = (idx: number) => {
    const seg = segments[idx];
    if (!seg) return;
    setCurrentSegIdx(idx);
    const totalSec = Math.round((parseFloat(seg.durationMinutes) || 1) * 60);

    // Schedule notifications ahead of time so they fire even if app is backgrounded
    // 1) "10 seconds remaining" warning (only if segment is longer than 15 sec)
    if (totalSec > 15) {
      scheduleNotification(
        "⏱ 10 seconds remaining",
        `Segment ${idx + 1} is about to end`,
        totalSec - 10,
      ).then((id) => scheduledNotifIds.current.push(id));
    }

    // 2) Segment-end notification
    const nextIdx = idx + 1;
    if (nextIdx < segments.length) {
      const next = segments[nextIdx];
      scheduleNotification(
        `Segment ${nextIdx + 1} starting`,
        `${next.durationMinutes} min${isTreadmill ? ` · ${next.speed || "—"} mph · ${next.incline || "0"}%` : ""}`,
        totalSec,
      ).then((id) => scheduledNotifIds.current.push(id));
    } else {
      scheduleNotification(
        "Cardio Complete 🎉",
        "All segments finished!",
        totalSec,
      ).then((id) => scheduledNotifIds.current.push(id));
    }

    countdown.startCountdown(totalSec, () => {
      const updated = [...segmentsDone];
      updated[idx] = true;
      setSegmentsDone(updated);
      if (nextIdx < segments.length) {
        kickOffSegment(nextIdx);
      }
    });
  };

  const handleStartSession = () => {
    requestNotificationPermission();
    setSessionStarted(true);
    scheduledNotifIds.current = [];
    kickOffSegment(0);
  };

  // Cancel all scheduled notifications on unmount / close
  useEffect(() => {
    return () => {
      scheduledNotifIds.current.forEach(cancelScheduledNotification);
      scheduledNotifIds.current = [];
    };
  }, []);

  if (!routine.hasCardio || segments.length === 0) {
    return (
      <View style={p.phaseContainer}>
        <Text style={p.phaseTitle}>No Cardio Configured</Text>
        <TouchableOpacity
          style={[p.completeBtn, { marginTop: 20 }]}
          onPress={onComplete}
        >
          <Text style={p.completeBtnText}>FINISH SESSION</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={p.phaseIconCircle}>
        <MaterialIcons name="directions-run" size={40} color={ORANGE} />
      </View>
      <Text style={[p.phaseTitle, { textAlign: "center" }]}>
        {routine.cardioType} Cardio
      </Text>
      <Text
        style={[p.phaseSubtitle, { textAlign: "center", marginBottom: 20 }]}
      >
        {segments.length} segment{segments.length > 1 ? "s" : ""}
      </Text>

      {/* Single START button before session begins */}
      {!sessionStarted && (
        <TouchableOpacity style={p.startBtn} onPress={handleStartSession}>
          <MaterialIcons name="play-arrow" size={20} color={WHITE} />
          <Text style={p.startBtnText}>START CARDIO</Text>
        </TouchableOpacity>
      )}

      {/* Global pause / resume once session is running */}
      {sessionStarted && !allDone && (
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          {countdown.running ? (
            <TouchableOpacity style={p.pauseBtn} onPress={countdown.pause}>
              <MaterialIcons name="pause" size={18} color={WHITE} />
              <Text style={p.pauseBtnText}>PAUSE</Text>
            </TouchableOpacity>
          ) : countdown.remaining > 0 ? (
            <TouchableOpacity style={p.startBtn} onPress={countdown.resume}>
              <MaterialIcons name="play-arrow" size={18} color={WHITE} />
              <Text style={p.startBtnText}>RESUME</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Segment list */}
      {segments.map((seg, idx) => {
        const isCurrent = idx === currentSegIdx && sessionStarted;
        const isDone = segmentsDone[idx];

        return (
          <View
            key={seg.id}
            style={[
              p.segmentCard,
              isCurrent && p.segmentCardActive,
              isDone && p.segmentCardDone,
            ]}
          >
            <View style={p.segmentHeader}>
              <View
                style={[p.segmentBadge, isDone && { backgroundColor: GREEN }]}
              >
                {isDone ? (
                  <MaterialIcons name="check" size={14} color={WHITE} />
                ) : (
                  <Text style={p.segmentBadgeText}>{idx + 1}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={p.segmentDuration}>{seg.durationMinutes} min</Text>
                {isTreadmill ? (
                  <Text style={p.segmentDetail}>
                    Speed {seg.speed} · Incline {seg.incline}%
                  </Text>
                ) : (
                  <Text style={p.segmentDetail}>
                    Resistance {seg.resistance}
                  </Text>
                )}
              </View>
              {isCurrent && !isDone && (
                <Text style={[p.segCountdown, warningZone && { color: RED }]}>
                  {formatTime(countdown.remaining)}
                </Text>
              )}
            </View>

            {/* Warning banner for current segment */}
            {isCurrent && !isDone && warningZone && (
              <View style={p.warningBanner}>
                <MaterialIcons
                  name="notifications-active"
                  size={16}
                  color={YELLOW}
                />
                <Text style={p.warningText}>Changing segment soon!</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Finish */}
      <TouchableOpacity
        style={[p.completeBtn, { marginTop: 24, opacity: allDone ? 1 : 0.5 }]}
        onPress={onComplete}
        disabled={!allDone}
      >
        <MaterialIcons name="check" size={20} color={WHITE} />
        <Text style={p.completeBtnText}>FINISH SESSION</Text>
      </TouchableOpacity>

      {!allDone && (
        <Text style={p.hintText}>Complete all cardio segments to finish</Text>
      )}
    </ScrollView>
  );
}

// ─── Done Phase ──────────────────────────────────────

function DonePhase({
  onGoHome,
  saving,
}: {
  onGoHome: () => void;
  saving?: boolean;
}) {
  return (
    <View style={p.phaseContainer}>
      <View style={[p.phaseIconCircle, { backgroundColor: "#0D2E18" }]}>
        <MaterialIcons name="celebration" size={40} color={GREEN} />
      </View>
      <Text style={p.phaseTitle}>Workout Complete! 🎉</Text>
      <Text style={p.phaseSubtitle}>
        {saving ? "Saving your workout…" : "Great job! You crushed it."}
      </Text>
      <TouchableOpacity
        style={[p.startBtn, { marginTop: 30 }, saving && { opacity: 0.6 }]}
        onPress={onGoHome}
        disabled={saving}
      >
        <Text style={p.startBtnText}>
          {saving ? "SAVING…" : "BACK TO HOME"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════

export default function StartWorkoutScreen() {
  const router = useRouter();
  const { routineId, dayIndex } = useLocalSearchParams<{
    routineId: string;
    dayIndex: string;
  }>();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const startTimeRef = useRef<Date>(new Date());
  const startCaloriesRef = useRef<number | null>(null);

  // Snapshot active calories at mount (workout start)
  useEffect(() => {
    if (Platform.OS === "ios") {
      getCumulativeActiveCalories().then((cals) => {
        startCaloriesRef.current = cals;
        if (__DEV__)
          console.log("[StartWorkout] Baseline active calories:", cals);
      });
    }
  }, []);

  // Fetch routine from API
  useEffect(() => {
    if (!routineId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await getRoutine(routineId);
        if (!res.ok) throw new Error("Failed to load routine");
        const json = await res.json();
        setRoutine(json.routine || json);
      } catch {
        Alert.alert("Error", "Could not load routine.");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId]);

  const workoutDays = routine?.days.filter((d: RoutineDay) => !d.isRest) || [];
  const todayDayIdx = parseInt(dayIndex || "0");
  const todayDay = workoutDays[todayDayIdx] || workoutDays[0];

  const [phase, setPhase] = useState<Phase>("warmup");

  // Once routine loads, set initial phase
  useEffect(() => {
    if (routine) {
      setPhase(routine.hasWarmup ? "warmup" : "workout");
    }
  }, [routine]);

  const handleWorkoutComplete = () => {
    if (routine?.hasCardio) {
      setPhase("cardio");
    } else {
      setPhase("done");
      saveWorkoutToApi();
    }
  };

  const handleCardioComplete = () => {
    setPhase("done");
    saveWorkoutToApi();
  };

  const saveWorkoutToApi = async () => {
    if (!routine || !todayDay) return;
    setSaving(true);
    try {
      const endTime = new Date();
      const durationSeconds = Math.floor(
        (endTime.getTime() - startTimeRef.current.getTime()) / 1000,
      );

      // Get active calories from Apple Health using snapshot difference
      let caloriesBurned: number | undefined;
      if (Platform.OS === "ios" && startCaloriesRef.current !== null) {
        try {
          const endCalories = await getCumulativeActiveCalories();
          if (endCalories !== null) {
            const diff = endCalories - startCaloriesRef.current;
            if (diff > 0) {
              caloriesBurned = diff;
              if (__DEV__)
                console.log(
                  "[StartWorkout] Active cals — start:",
                  startCaloriesRef.current,
                  "end:",
                  endCalories,
                  "diff:",
                  diff,
                );
            }
          }
        } catch (err) {
          console.warn("Could not read Apple Health calories:", err);
        }
      }

      const payload: Record<string, any> = {
        title: `${routine.name} — ${todayDay.label}`,
        type: "routine" as const,
        date: new Date().toISOString(),
        routineId: (routine as any)._id || routineId,
        exercises: todayDay.exercises.map((ex) => ({
          name: ex.name,
          equipment: ex.equipment,
          sets: Array.from({ length: ex.sets }, () => ({
            weight: 0,
            reps: parseInt(ex.reps) || 0,
            completed: true,
          })),
        })),
        durationSeconds,
      };
      if (caloriesBurned !== undefined) {
        payload.caloriesBurned = caloriesBurned;
      }
      const res = await createWorkout(payload);
      if (!res.ok) {
        console.warn("Failed to save workout");
      }
    } catch {
      console.warn("Error saving workout");
    } finally {
      setSaving(false);
    }
  };

  const phaseLabels: Record<Phase, string> = {
    warmup: "Warmup",
    workout: todayDay?.label || "Workout",
    cardio: "Cardio",
    done: "Complete",
  };

  const phases: Phase[] = routine?.hasWarmup
    ? routine?.hasCardio
      ? ["warmup", "workout", "cardio"]
      : ["warmup", "workout"]
    : routine?.hasCardio
      ? ["workout", "cardio"]
      : ["workout"];

  const currentPhaseIndex = phases.indexOf(phase);

  // Loading state
  if (loading || !routine) {
    return (
      <SafeAreaView
        style={[
          p.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={{ color: SUBTLE_TEXT, marginTop: 16 }}>
          Loading workout…
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={p.container}>
      {/* Header */}
      <View style={p.header}>
        <TouchableOpacity
          onPress={() => {
            if (phase === "done") {
              router.back();
            } else {
              Alert.alert("Leave Workout?", "Your progress will be lost.", [
                { text: "Stay", style: "cancel" },
                {
                  text: "Leave",
                  style: "destructive",
                  onPress: () => router.back(),
                },
              ]);
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={WHITE} />
        </TouchableOpacity>
        <Text style={p.headerTitle}>{phaseLabels[phase]}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Phase indicator */}
      {phase !== "done" && (
        <View style={p.phaseIndicator}>
          {phases.map((ph, idx) => (
            <View key={ph} style={p.phaseIndicatorItem}>
              <View
                style={[
                  p.phaseDot,
                  idx <= currentPhaseIndex && p.phaseDotActive,
                  idx < currentPhaseIndex && { backgroundColor: GREEN },
                ]}
              />
              <Text
                style={[
                  p.phaseIndicatorText,
                  idx <= currentPhaseIndex && { color: WHITE },
                ]}
              >
                {phaseLabels[ph]}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Phase content */}
      {phase === "warmup" && (
        <WarmupPhase
          routine={routine}
          onSkip={() => setPhase("workout")}
          onComplete={() => setPhase("workout")}
        />
      )}
      {phase === "workout" && todayDay && (
        <WorkoutPhase
          routine={routine}
          todayDay={todayDay}
          onComplete={handleWorkoutComplete}
        />
      )}
      {phase === "cardio" && (
        <CardioPhase routine={routine} onComplete={handleCardioComplete} />
      )}
      {phase === "done" && (
        <DonePhase onGoHome={() => router.back()} saving={saving} />
      )}
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════

const p = StyleSheet.create({
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

  // Phase indicator
  phaseIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  phaseIndicatorItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BORDER_COLOR,
  },
  phaseDotActive: { backgroundColor: ORANGE },
  phaseIndicatorText: { color: SUBTLE_TEXT, fontSize: 12, fontWeight: "600" },

  // Phase container (centered)
  phaseContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  phaseIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1E1209",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  phaseTitle: {
    color: WHITE,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 6,
  },
  phaseSubtitle: { color: SUBTLE_TEXT, fontSize: 15, marginBottom: 10 },

  // Timer
  bigTimer: {
    color: ORANGE,
    fontSize: 48,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
    marginVertical: 16,
  },
  targetText: { color: SUBTLE_TEXT, fontSize: 14, marginBottom: 20 },

  // Progress bar
  progressBarOuter: {
    width: "100%",
    height: 4,
    backgroundColor: BORDER_COLOR,
    borderRadius: 2,
    marginBottom: 12,
  },
  progressBarInner: {
    height: 4,
    backgroundColor: ORANGE,
    borderRadius: 2,
  },

  // Buttons
  btnRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ORANGE,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
  },
  startBtnText: { color: WHITE, fontSize: 15, fontWeight: "bold" },
  pauseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD_BG,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    gap: 8,
  },
  pauseBtnText: { color: WHITE, fontSize: 15, fontWeight: "bold" },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  skipBtnText: { color: SUBTLE_TEXT, fontSize: 14, fontWeight: "600" },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GREEN,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
  },
  completeBtnText: { color: WHITE, fontSize: 15, fontWeight: "bold" },

  // Workout phase
  workoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  workoutTimerLabel: { color: SUBTLE_TEXT, fontSize: 11, marginBottom: 2 },
  workoutTimer: {
    color: ORANGE,
    fontSize: 24,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
  },
  workoutProgress: { color: WHITE, fontSize: 16, fontWeight: "bold" },

  exerciseCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  exerciseCardName: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 2,
  },
  exerciseCardTarget: { color: SUBTLE_TEXT, fontSize: 12, marginBottom: 12 },
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER_COLOR,
  },
  colHeader: {
    color: SUBTLE_TEXT,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },

  workoutSetRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  workoutSetRowDone: { opacity: 0.6 },
  setNum: { color: WHITE, fontSize: 14, fontWeight: "600", width: 30 },
  setInput: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#2A2019",
    borderWidth: 1,
    borderColor: "#3D2E1A",
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: 4,
  },
  setInputDone: { backgroundColor: "#1A2E1A", borderColor: "#2E4E2E" },
  checkBtn: { width: 36, alignItems: "center", justifyContent: "center" },
  checkBtnDone: {},

  hintText: {
    color: SUBTLE_TEXT,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },

  // Cardio segments
  segmentCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentCardActive: { borderColor: ORANGE },
  segmentCardDone: { borderColor: GREEN, opacity: 0.7 },
  segmentHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  segmentBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBadgeText: { color: WHITE, fontSize: 12, fontWeight: "bold" },
  segmentDuration: { color: WHITE, fontSize: 15, fontWeight: "bold" },
  segmentDetail: { color: SUBTLE_TEXT, fontSize: 12, marginTop: 1 },
  segCountdown: {
    color: ORANGE,
    fontSize: 20,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
  },
  segControls: { marginTop: 12, alignItems: "center" },

  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    backgroundColor: "#3D2E0A",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  warningText: { color: YELLOW, fontSize: 13, fontWeight: "600" },
});
