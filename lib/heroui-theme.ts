import { createTheme } from "@heroui/theme";

// Светлая тема
export const lightTheme = createTheme({
  type: "light",
  theme: {
    colors: {
      // Основные цвета
      background: "#ffffff",
      foreground: "#111827",
      
      // Primary (синий)
      primary: {
        50: "#eff6ff",
        100: "#dbeafe",
        200: "#bfdbfe",
        300: "#93c5fd",
        400: "#60a5fa",
        500: "#2563eb", // Основной
        600: "#1d4ed8",
        700: "#1e40af",
        800: "#1e3a8a",
        900: "#1e3a8a",
        DEFAULT: "#2563eb",
        foreground: "#ffffff",
      },
      
      // Secondary (серый)
      secondary: {
        50: "#f9fafb",
        100: "#f3f4f6",
        200: "#e5e7eb",
        300: "#d1d5db",
        400: "#9ca3af",
        500: "#6b7280",
        600: "#4b5563",
        700: "#374151",
        800: "#1f2937",
        900: "#111827",
        DEFAULT: "#f3f4f6",
        foreground: "#374151",
      },
      
      // Success (зеленый)
      success: {
        50: "#ecfdf5",
        100: "#d1fae5",
        200: "#a7f3d0",
        300: "#6ee7b7",
        400: "#34d399",
        500: "#10b981",
        600: "#059669",
        700: "#047857",
        800: "#065f46",
        900: "#064e3b",
        DEFAULT: "#10b981",
        foreground: "#ffffff",
      },
      
      // Warning (оранжевый)
      warning: {
        50: "#fffbeb",
        100: "#fef3c7",
        200: "#fde68a",
        300: "#fcd34d",
        400: "#fbbf24",
        500: "#f59e0b",
        600: "#d97706",
        700: "#b45309",
        800: "#92400e",
        900: "#78350f",
        DEFAULT: "#f59e0b",
        foreground: "#ffffff",
      },
      
      // Danger (красный)
      danger: {
        50: "#fef2f2",
        100: "#fee2e2",
        200: "#fecaca",
        300: "#fca5a5",
        400: "#f87171",
        500: "#ef4444",
        600: "#dc2626",
        700: "#b91c1c",
        800: "#991b1b",
        900: "#7f1d1d",
        DEFAULT: "#ef4444",
        foreground: "#ffffff",
      },
      
      // Muted
      default: {
        50: "#f9fafb",
        100: "#f3f4f6",
        200: "#e5e7eb",
        300: "#d1d5db",
        400: "#9ca3af",
        500: "#6b7280",
        600: "#4b5563",
        700: "#374151",
        800: "#1f2937",
        900: "#111827",
        DEFAULT: "#f3f4f6",
        foreground: "#374151",
      },
    },
    layout: {
      borderRadius: {
        small: "0.5rem",
        medium: "0.75rem",
        large: "1rem",
      },
    },
  },
});

// Темная тема
export const darkTheme = createTheme({
  type: "dark",
  theme: {
    colors: {
      // Основные цвета
      background: "#0f172a",
      foreground: "#f8fafc",
      
      // Primary (синий) - более яркий для темной темы
      primary: {
        50: "#1e3a8a",
        100: "#1e40af",
        200: "#1d4ed8",
        300: "#2563eb",
        400: "#3b82f6",
        500: "#60a5fa", // Основной для темной темы
        600: "#93c5fd",
        700: "#bfdbfe",
        800: "#dbeafe",
        900: "#eff6ff",
        DEFAULT: "#60a5fa",
        foreground: "#0f172a",
      },
      
      // Secondary (серый)
      secondary: {
        50: "#111827",
        100: "#1f2937",
        200: "#374151",
        300: "#4b5563",
        400: "#6b7280",
        500: "#9ca3af",
        600: "#d1d5db",
        700: "#e5e7eb",
        800: "#f3f4f6",
        900: "#f9fafb",
        DEFAULT: "#1f2937",
        foreground: "#d1d5db",
      },
      
      // Success (зеленый)
      success: {
        50: "#064e3b",
        100: "#065f46",
        200: "#047857",
        300: "#059669",
        400: "#10b981",
        500: "#34d399",
        600: "#6ee7b7",
        700: "#a7f3d0",
        800: "#d1fae5",
        900: "#ecfdf5",
        DEFAULT: "#34d399",
        foreground: "#064e3b",
      },
      
      // Warning (оранжевый)
      warning: {
        50: "#78350f",
        100: "#92400e",
        200: "#b45309",
        300: "#d97706",
        400: "#f59e0b",
        500: "#fbbf24",
        600: "#fcd34d",
        700: "#fde68a",
        800: "#fef3c7",
        900: "#fffbeb",
        DEFAULT: "#fbbf24",
        foreground: "#78350f",
      },
      
      // Danger (красный)
      danger: {
        50: "#7f1d1d",
        100: "#991b1b",
        200: "#b91c1c",
        300: "#dc2626",
        400: "#ef4444",
        500: "#f87171",
        600: "#fca5a5",
        700: "#fecaca",
        800: "#fee2e2",
        900: "#fef2f2",
        DEFAULT: "#f87171",
        foreground: "#ffffff",
      },
      
      // Default (серый)
      default: {
        50: "#111827",
        100: "#1f2937",
        200: "#374151",
        300: "#4b5563",
        400: "#6b7280",
        500: "#9ca3af",
        600: "#d1d5db",
        700: "#e5e7eb",
        800: "#f3f4f6",
        900: "#f9fafb",
        DEFAULT: "#1f2937",
        foreground: "#d1d5db",
      },
    },
    layout: {
      borderRadius: {
        small: "0.5rem",
        medium: "0.75rem",
        large: "1rem",
      },
    },
  },
});
