/**
 * Fluid Architect Design System — tokens
 * Dark indigo theme with glassmorphism, gradients, tonal layering.
 */

export const colors = {
  surface: "#0b1326",
  surfaceDim: "#0b1326",
  surfaceContainerLowest: "#060e20",
  surfaceContainerLow: "#131b2e",
  surfaceContainer: "#171f33",
  surfaceContainerHigh: "#222a3d",
  surfaceContainerHighest: "#2d3449",
  surfaceBright: "#31394d",
  surfaceVariant: "#2d3449",

  primary: "#c3c0ff",
  primaryContainer: "#4f46e5",
  primaryFixedDim: "#c3c0ff",
  onPrimary: "#1d00a5",
  onPrimaryContainer: "#dad7ff",

  secondary: "#d0bcff",
  secondaryContainer: "#571bc1",
  onSecondary: "#3c0091",
  onSecondaryContainer: "#c4abff",

  tertiary: "#4cd7f6",
  tertiaryContainer: "#006a7c",
  onTertiary: "#003640",
  onTertiaryContainer: "#93e8ff",

  error: "#ffb4ab",
  errorContainer: "#93000a",
  onError: "#690005",
  onErrorContainer: "#ffdad6",

  onSurface: "#dae2fd",
  onSurfaceVariant: "#c7c4d8",
  onBackground: "#dae2fd",
  background: "#0b1326",

  outline: "#918fa1",
  outlineVariant: "#464555",

  inverseSurface: "#dae2fd",
  inverseOnSurface: "#283044",
  inversePrimary: "#4d44e3",

  surfaceTint: "#c3c0ff",

  glass: "rgba(34, 42, 61, 0.6)",
  glassLight: "rgba(45, 52, 73, 0.6)",
  gradientStart: "#4f46e5",
  gradientEnd: "#c3c0ff",

  white: "#ffffff",
  transparent: "transparent",
} as const;

export const fonts = {
  headline: "Manrope_700Bold",
  headlineExtrabold: "Manrope_800ExtraBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
  label: "Inter_400Regular",
  labelMedium: "Inter_500Medium",
  labelSemibold: "Inter_600SemiBold",
} as const;

export const spacing = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 32,
  "5xl": 40,
  "6xl": 48,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 40,
  full: 9999,
} as const;

export type FluidTextVariant =
  | "displayLg"
  | "headlineLg"
  | "headlineSm"
  | "titleLg"
  | "titleMd"
  | "titleSm"
  | "bodyLg"
  | "bodyMd"
  | "bodySm"
  | "labelLg"
  | "labelMd"
  | "labelSm";

export const textStyles: Record<
  FluidTextVariant,
  { fontSize: number; lineHeight: number; fontFamily: string; letterSpacing?: number }
> = {
  displayLg: { fontSize: 36, lineHeight: 44, fontFamily: fonts.headlineExtrabold, letterSpacing: -0.5 },
  headlineLg: { fontSize: 28, lineHeight: 36, fontFamily: fonts.headline, letterSpacing: -0.3 },
  headlineSm: { fontSize: 22, lineHeight: 28, fontFamily: fonts.headline },
  titleLg: { fontSize: 20, lineHeight: 28, fontFamily: fonts.headline },
  titleMd: { fontSize: 16, lineHeight: 24, fontFamily: fonts.bodySemibold },
  titleSm: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodySemibold },
  bodyLg: { fontSize: 16, lineHeight: 24, fontFamily: fonts.body },
  bodyMd: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body, letterSpacing: -0.01 },
  bodySm: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  labelLg: { fontSize: 14, lineHeight: 20, fontFamily: fonts.labelMedium },
  labelMd: { fontSize: 12, lineHeight: 16, fontFamily: fonts.labelMedium },
  labelSm: { fontSize: 11, lineHeight: 16, fontFamily: fonts.label },
};
