import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radii, spacing } from "../../theme/tokens";
import { FluidText } from "./FluidText";

type Props = TextInputProps & {
  label?: string;
};

export function FluidInput({ label, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrapper,
        focused && styles.wrapperFocused,
        style as any,
      ]}
    >
      {label && (
        <FluidText variant="labelSm" color={focused ? colors.primary : colors.onSurfaceVariant} style={styles.label}>
          {label}
        </FluidText>
      )}
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.outline}
        selectionColor={colors.primary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii["2xl"],
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(70, 69, 85, 0.15)",
  },
  wrapperFocused: {
    borderColor: "rgba(195, 192, 255, 0.5)",
  },
  label: {
    marginBottom: spacing.sm,
  },
  input: {
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
  },
});
