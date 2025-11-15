import { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "MyUnion — единая панель управления профсоюзом",
  description: "Управляйте документами, участниками и уведомлениями в одном месте",
};

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {ONESIGNAL_APP_ID && (
          <>
            {/* Initialize OneSignal configuration before SDK loads */}
            <Script
              id="onesignal-config"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.OneSignal = window.OneSignal || [];
                  window.OneSignalConfig = {
                    appId: "${ONESIGNAL_APP_ID}",
                    allowLocalhostAsSecureOrigin: true,
                  };
                `,
              }}
            />
            
            {/* Load OneSignal SDK and initialize */}
            <Script
              id="onesignal-sdk"
              src="https://cdn.onesignal.com/sdks/web/v15/OneSignalSDK.page.js"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  // This runs in parallel with loading the SDK script
                  if (typeof OneSignal !== 'undefined' && OneSignal.init) {
                    console.log("[OneSignal] SDK loaded, initializing...");
                    OneSignal.init(window.OneSignalConfig);
                    console.log("[OneSignal] ✅ Initialized");
                  } else {
                    // SDK might not be ready yet, queue the init
                    window.OneSignal = window.OneSignal || [];
                    window.OneSignal.push(() => {
                      console.log("[OneSignal] SDK ready via push, initializing...");
                      window.OneSignal.init(window.OneSignalConfig);
                      console.log("[OneSignal] ✅ Initialized via push");
                    });
                  }
                `,
              }}
            />
          </>
        )}
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
