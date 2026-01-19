"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { HeroUIProvider } from "@heroui/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import FirebasePushInit from "./firebase-push-init";
import { LanguageProvider } from "@/lib/language-context";
import { AlertProvider } from "./providers/AlertProvider";
import { ToastProvider } from "./ui/Toast";
import ErrorHandler from "./ErrorHandler";
import { lightTheme, darkTheme } from "@/lib/heroui-theme";

// Внутренний провайдер для синхронизации тем HeroUI с next-themes
function HeroUIThemeSync({ children }: { children: React.ReactNode }) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Определяем активную тему
  const currentTheme = mounted && resolvedTheme === "dark" ? darkTheme : lightTheme;

  return (
    <HeroUIProvider theme={currentTheme}>
      {children}
    </HeroUIProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth">
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem={true}
        storageKey="myunion-theme"
        disableTransitionOnChange={false}
      >
        <HeroUIThemeSync>
          <LanguageProvider>
            <AlertProvider>
              <ToastProvider>
                <ErrorHandler />
                <FirebasePushInit />
                {children}
              </ToastProvider>
            </AlertProvider>
          </LanguageProvider>
        </HeroUIThemeSync>
      </NextThemesProvider>
    </SessionProvider>
  );
}

