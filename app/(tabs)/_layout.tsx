import { Tabs, Redirect } from "expo-router";
import React, { useEffect, useRef } from "react";
import { useAuth } from "@clerk/expo";
import { AppState, Platform } from "react-native";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { HapticTab } from "@/components/haptic-tab";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  maybeSyncUserDetailsDaily,
  syncHealthDataOnAppOpen,
  BACKGROUND_HEALTH_SYNC_TASK,
  runBackgroundHealthSync,
} from "@/services/health";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const SUBTLE_TEXT = "#888";

// Register background task at module scope (must be top-level)
TaskManager.defineTask(BACKGROUND_HEALTH_SYNC_TASK, async () => {
  const result = await runBackgroundHealthSync();
  return result as BackgroundFetch.BackgroundFetchResult;
});

async function registerBackgroundFetch() {
  if (Platform.OS !== "ios") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_HEALTH_SYNC_TASK,
    );
    if (isRegistered) return;

    await BackgroundFetch.registerTaskAsync(BACKGROUND_HEALTH_SYNC_TASK, {
      minimumInterval: 6 * 60 * 60, // 6 hours — iOS will run roughly every ~6h
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log("[BackgroundFetch] Health sync task registered");
  } catch (err) {
    console.warn("[BackgroundFetch] Registration error:", err);
  }
}

export default function TabLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const hasSynced = useRef(false);

  // Once-daily sync of user details from HealthKit + register background task
  useEffect(() => {
    if (isSignedIn && !hasSynced.current) {
      hasSynced.current = true;

      // Small delay to let Clerk session hydrate fully so tokens are ready
      const timeout = setTimeout(() => {
        maybeSyncUserDetailsDaily().catch((err) =>
          console.warn("[TabLayout] daily health sync error:", err),
        );
        syncHealthDataOnAppOpen().catch((err) =>
          console.warn("[TabLayout] app-open health data sync error:", err),
        );
        // Register background fetch for periodic syncs
        registerBackgroundFetch();
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [isSignedIn]);

  // Re-sync health data whenever the app returns from background
  useEffect(() => {
    if (!isSignedIn) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        // Small delay to let Clerk session token refresh after foregrounding
        setTimeout(() => {
          syncHealthDataOnAppOpen().catch((err) =>
            console.warn("[TabLayout] foreground health sync error:", err),
          );
        }, 1500);
      }
    });

    return () => subscription.remove();
  }, [isSignedIn]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: SUBTLE_TEXT,
        tabBarStyle: {
          backgroundColor: DARK_BG,
          borderTopColor: "#222",
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="home" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="insights" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="person" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
