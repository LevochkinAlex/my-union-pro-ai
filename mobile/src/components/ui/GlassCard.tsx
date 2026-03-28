import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { colors, radii } from "../../theme/tokens";

type Props = ViewProps & {
  borderRadius?: number;
  intensity?: number;
};

export function GlassCard({ borderRadius = radii["4xl"], style, children, ...rest }: Props) {
  if (Platform.OS === "ios") {
    const BlurView = require("expo-blur").BlurView;
    return (
      <BlurView intensity={40} tint="dark" style={[styles.card, { borderRadius }, style]} {...rest}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.card, styles.fallback, { borderRadius }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
  },
  fallback: {
    backgroundColor: colors.glass,
  },
});
