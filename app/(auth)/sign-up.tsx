import { useSignUp, useAuth } from "@clerk/expo";
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
import { syncUser } from "@/services/api";

const ORANGE = "#E8651A";
const DARK_BG = "#0D0D0D";
const CARD_BG = "#1A1A1A";
const INPUT_BG = "#1E1E1E";
const SUBTLE_TEXT = "#888";
const WHITE = "#FFFFFF";
const BORDER_COLOR = "#333";
const RED = "#E74C3C";

export default function SignUpScreen() {
  const { signUp, errors: clerkErrors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");

  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState("");

  if (isSignedIn) return null;

  const isLoading = fetchStatus === "fetching";

  // ─── Step 1: Create account with password & send verification email ───
  const handleSignUp = async () => {
    if (!firstName.trim() || !emailAddress.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setError("");

    // Use signUp.password() — creates the sign-up and sets password in one call
    const { error: passwordError } = await signUp.password({
      emailAddress: emailAddress.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });

    if (passwordError) {
      setError(
        passwordError.message || "Something went wrong. Please try again.",
      );
      return;
    }

    // Send email verification code
    const { error: sendError } = await signUp.verifications.sendEmailCode();

    if (sendError) {
      setError(sendError.message || "Failed to send verification email.");
      return;
    }

    setPendingVerification(true);
  };

  // ─── Step 2: Verify email & sync user to backend ──────────
  const handleVerify = async () => {
    if (!code.trim()) {
      setError("Please enter the verification code.");
      return;
    }

    setError("");

    const { error: verifyError } = await signUp.verifications.verifyEmailCode({
      code: code.trim(),
    });

    if (verifyError) {
      setError(
        verifyError.message || "Invalid verification code. Please try again.",
      );
      return;
    }

    if (signUp.status === "complete") {
      // Finalize — sets the newly created session as active
      const { error: finalizeError } = await signUp.finalize({
        navigate: () => {
          // We handle navigation ourselves after backend sync
        },
      });

      if (finalizeError) {
        setError(finalizeError.message || "Failed to complete sign-up.");
        return;
      }

      // Sync user to our backend database
      try {
        await syncUser({
          clerkId: signUp.createdUserId || "",
          email: emailAddress.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        });
      } catch (_syncErr) {
        // Don't block the user if backend sync fails — can be retried
        console.warn("Backend user sync failed:", _syncErr);
      }

      router.replace("/(tabs)");
    } else {
      setError("Verification incomplete. Please try again.");
    }
  };

  // ─── Resend code ──────────────────────────────────────────
  const handleResendCode = async () => {
    setError("");
    const { error: resendError } = await signUp.verifications.sendEmailCode();
    if (resendError) {
      setError("Failed to resend code. Please try again.");
    }
  };

  // ─── Verification Screen ─────────────────────────────────
  if (pendingVerification) {
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
            {/* Back button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setPendingVerification(false)}
            >
              <MaterialIcons name="arrow-back" size={24} color={WHITE} />
            </TouchableOpacity>

            {/* Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <MaterialIcons
                  name="mark-email-read"
                  size={40}
                  color={ORANGE}
                />
              </View>
            </View>

            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.subtitle}>
              {"We\u2019ve sent a verification code to\n"}
              <Text style={styles.emailHighlight}>{emailAddress}</Text>
            </Text>

            {/* Code Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Enter 6-digit code"
                placeholderTextColor={SUBTLE_TEXT}
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
              />
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
              onPress={handleVerify}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={WHITE} size="small" />
              ) : (
                <>
                  <MaterialIcons name="verified" size={18} color={WHITE} />
                  <Text style={styles.primaryButtonText}>VERIFY EMAIL</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleResendCode}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>
                {"Didn\u2019t receive a code? Resend"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── Sign Up Form ────────────────────────────────────────
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

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Join Flex Appeal and start tracking your fitness journey
          </Text>

          {/* First Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              First Name <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputContainer}>
              <MaterialIcons
                name="person"
                size={18}
                color={SUBTLE_TEXT}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.inputWithIcon}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter your first name"
                placeholderTextColor={SUBTLE_TEXT}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Last Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last Name</Text>
            <View style={styles.inputContainer}>
              <MaterialIcons
                name="person-outline"
                size={18}
                color={SUBTLE_TEXT}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.inputWithIcon}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter your last name"
                placeholderTextColor={SUBTLE_TEXT}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Email Address <Text style={styles.required}>*</Text>
            </Text>
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
            {clerkErrors?.fields?.emailAddress && (
              <Text style={styles.fieldError}>
                {clerkErrors.fields.emailAddress.message}
              </Text>
            )}
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Password <Text style={styles.required}>*</Text>
            </Text>
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
                placeholder="Create a password"
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

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={WHITE} size="small" />
            ) : (
              <>
                <MaterialIcons name="person-add" size={18} color={WHITE} />
                <Text style={styles.primaryButtonText}>CREATE ACCOUNT</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Link to sign-in */}
          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <Link href={"/(auth)/sign-in" as any} asChild>
              <TouchableOpacity>
                <Text style={styles.linkHighlight}>Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {/* Clerk bot protection */}
          <View nativeID="clerk-captcha" />

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
    paddingTop: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
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
    marginBottom: 28,
    lineHeight: 22,
  },
  emailHighlight: {
    color: ORANGE,
    fontWeight: "600",
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
  required: {
    color: ORANGE,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: WHITE,
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
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  secondaryButtonText: {
    color: ORANGE,
    fontSize: 14,
    fontWeight: "600",
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
