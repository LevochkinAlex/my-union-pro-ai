const config = {
  plugins: {
    "@tailwindcss/postcss": {
      darkMode: "class",
    },
    "@heroui/theme": {
      // Настройка тем через плагин
      defaultTheme: "light",
      themes: {
        light: {
          colors: {
            background: "#ffffff",
            foreground: "#111827",
            primary: {
              50: "#eff6ff",
              100: "#dbeafe",
              200: "#bfdbfe",
              300: "#93c5fd",
              400: "#60a5fa",
              500: "#2563eb",
              600: "#1d4ed8",
              700: "#1e40af",
              800: "#1e3a8a",
              900: "#1e3a8a",
              DEFAULT: "#2563eb",
              foreground: "#ffffff",
            },
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
            success: {
              DEFAULT: "#10b981",
              foreground: "#ffffff",
            },
            warning: {
              DEFAULT: "#f59e0b",
              foreground: "#ffffff",
            },
            danger: {
              DEFAULT: "#ef4444",
              foreground: "#ffffff",
            },
          },
        },
        dark: {
          colors: {
            background: "#0f172a",
            foreground: "#f8fafc",
            primary: {
              50: "#1e3a8a",
              100: "#1e40af",
              200: "#1d4ed8",
              300: "#2563eb",
              400: "#3b82f6",
              500: "#60a5fa",
              600: "#93c5fd",
              700: "#bfdbfe",
              800: "#dbeafe",
              900: "#eff6ff",
              DEFAULT: "#60a5fa",
              foreground: "#0f172a",
            },
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
            success: {
              DEFAULT: "#34d399",
              foreground: "#064e3b",
            },
            warning: {
              DEFAULT: "#fbbf24",
              foreground: "#78350f",
            },
            danger: {
              DEFAULT: "#f87171",
              foreground: "#ffffff",
            },
          },
        },
      },
    },
  },
};

export default config;
