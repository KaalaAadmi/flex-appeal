import { useSignIn, useAuth } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const INPUT_BG = "#1E1E1E";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const BORDER_COLOR = "#333";
const RED = "#E74C3C";

export default function SignInScreen() {
  const { signIn, errors: clerkErrors, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  if (isSignedIn) return null;

  const isLoading = fetchStatus === "fetching";

  // ─── Sign in with email + password ────────────────────────
  const handleSignIn = async () => {
    if (!emailAddress.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setError("");

    const { error: signInError } = await signIn.password({
      emailAddress: emailAddress.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message || "Invalid credentials. Please try again.");
      return;
    }

    if (signIn.status === "complete") {
      const { error: finalizeError } = await signIn.finalize({
        navigate: () => {
          // We handle navigation ourselves
        },
      });

      if (finalizeError) {
        setError(finalizeError.message || "Failed to complete sign-in.");
        return;
      }

      router.replace("/(tabs)");
    } else {
      // Handle other statuses (e.g. needs_second_factor)
      setError("Sign-in requires additional steps. Please contact support.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="fitness-center" size={40} color={ORANGE} />
            </View>
          </View>

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            Sign in to continue your fitness journey
          </Text>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <MaterialIcons
                name="email"
                size={18}
                color={SUBTLE_TEXT}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.inputWithIcon}
                value={emailAddress}
                onChangeText={setEmailAddress}
                placeholder="you@example.com"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {clerkErrors?.fields?.identifier && (
              <Text style={styles.fieldError}>
                {clerkErrors.fields.identifier.message}
              </Text>
            )}
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <MaterialIcons
                name="lock"
                size={18}
                color={SUBTLE_TEXT}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.inputWithIcon, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={SUBTLE_TEXT}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <MaterialIcons
                  name={showPassword ? "visibility" : "visibility-off"}
                  size={20}
                  color={SUBTLE_TEXT}
                />
              </TouchableOpacity>
            </View>
            {clerkErrors?.fields?.password && (
              <Text style={styles.fieldError}>
                {clerkErrors.fields.password.message}
              </Text>
            )}
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={16} color={RED} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {clerkErrors?.global && clerkErrors.global.length > 0 && (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={16} color={RED} />
              <Text style={styles.errorText}>
                {clerkErrors.global[0].message}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={WHITE} size="small" />
            ) : (
              <>
                <MaterialIcons name="login" size={18} color={WHITE} />
                <Text style={styles.primaryButtonText}>SIGN IN</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Link to sign-up */}
          <View style={styles.linkRow}>
            <Text style={styles.linkText}>
              {"Don\u2019t have an account? "}
            </Text>
            <Link href={"/(auth)/sign-up" as any} asChild>
              <TouchableOpacity>
                <Text style={styles.linkHighlight}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>

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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: CARD_BG,
    borderWidth: 2,
    borderColor: ORANGE + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: WHITE,
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: SUBTLE_TEXT,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputWithIcon: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: WHITE,
  },
  eyeButton: {
    padding: 6,
  },
  fieldError: {
    color: RED,
    fontSize: 12,
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: RED + "15",
    borderWidth: 1,
    borderColor: RED + "30",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: RED,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ORANGE,
    paddingVertical: 16,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  linkText: {
    color: SUBTLE_TEXT,
    fontSize: 14,
  },
  linkHighlight: {
    color: ORANGE,
    fontSize: 14,
    fontWeight: "bold",
  },
});
