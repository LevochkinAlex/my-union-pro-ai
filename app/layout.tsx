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
            {/* Initialize OneSignal queue before SDK loads */}
            <Script
              id="onesignal-queue"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.OneSignal = window.OneSignal || []; window.OneSignalAppId = "${ONESIGNAL_APP_ID}";`,
              }}
            />
            
            {/* Load OneSignal init script */}
            <Script
              id="onesignal-init"
              src="/onesignal-init.js"
              strategy="beforeInteractive"
            />
            
            {/* Load OneSignal SDK */}
            <Script
              id="onesignal-sdk"
              src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
              strategy="afterInteractive"
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
