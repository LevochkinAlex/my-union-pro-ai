"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { HeroUIProvider } from "@heroui/react";
import FirebasePushInit from "./firebase-push-init";
import { LanguageProvider } from "@/lib/language-context";
import { AlertProvider } from "./providers/AlertProvider";
import { ToastProvider } from "./ui/Toast";
import ErrorHandler from "./ErrorHandler";

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
        <HeroUIProvider>
          <LanguageProvider>
            <AlertProvider>
              <ToastProvider>
                <ErrorHandler />
                <FirebasePushInit />
                {children}
              </ToastProvider>
            </AlertProvider>
          </LanguageProvider>
        </HeroUIProvider>
      </NextThemesProvider>
    </SessionProvider>
  );
}

