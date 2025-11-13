import { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { onest } from "./fonts";

export const metadata: Metadata = {
  title: "MyUnion — единая панель управления профсоюзом",
  description: "Управляйте документами, участниками и уведомлениями в одном месте",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${onest.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
