import { Text, type TextProps, type TextStyle } from "react-native";
import { colors, textStyles, type FluidTextVariant } from "../../theme/tokens";

type Props = TextProps & {
  variant?: FluidTextVariant;
  color?: string;
};

export function FluidText({ variant = "bodyMd", color, style, ...rest }: Props) {
  const ts = textStyles[variant];
  const merged: TextStyle = {
    ...ts,
    color: color ?? colors.onSurface,
  };
  return <Text style={[merged, style]} {...rest} />;
}
