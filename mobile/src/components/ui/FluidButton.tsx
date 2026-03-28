import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, radii, spacing } from "../../theme/tokens";
import { FluidText } from "./FluidText";

type Variant = "primary" | "surface" | "ghost" | "danger";

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
};

export function FluidButton({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
}: Props) {
  const isDisabled = disabled || loading;

  if (variant === "primary") {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          pressed && styles.pressed,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              {icon}
              <FluidText variant="titleSm" color={colors.white} style={styles.label}>
                {title}
              </FluidText>
            </>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  const bg =
    variant === "surface"
      ? colors.surfaceContainerHighest
      : variant === "danger"
        ? colors.errorContainer
        : colors.transparent;

  const textColor =
    variant === "ghost"
      ? colors.primary
      : variant === "danger"
        ? colors.onErrorContainer
        : colors.onSurface;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles.flat,
        { backgroundColor: bg },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon}
          <FluidText variant="titleSm" color={textColor} style={styles.label}>
            {title}
          </FluidText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii["2xl"],
    overflow: "hidden",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing["3xl"],
  },
  flat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing["3xl"],
  },
  label: {
    fontFamily: fonts.bodySemibold,
    letterSpacing: 0.3,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});
