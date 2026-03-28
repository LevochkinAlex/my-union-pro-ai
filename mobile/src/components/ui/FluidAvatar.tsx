import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from "react-native";
import { colors, radii } from "../../theme/tokens";
import { FluidText } from "./FluidText";

type Props = {
  uri?: string | null;
  name?: string;
  size?: number;
  rounded?: "xl" | "full";
  ringColor?: string;
  style?: ViewStyle | ImageStyle;
};

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function FluidAvatar({ uri, name, size = 40, rounded = "xl", ringColor, style }: Props) {
  const br = rounded === "full" ? size / 2 : radii.xl;
  const ring = ringColor ? { borderWidth: 2, borderColor: ringColor } : {};

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[{ width: size, height: size, borderRadius: br }, ring, style as ImageStyle]}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: br },
        ring,
        style,
      ]}
    >
      <FluidText variant="labelMd" color={colors.primary}>
        {initials(name)}
      </FluidText>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
});
