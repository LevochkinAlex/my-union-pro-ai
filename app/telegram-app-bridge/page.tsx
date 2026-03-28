import { TelegramAppBridgePageContent } from "@/components/auth/TelegramAppBridgeClient";

/** Основной URL для return_to OAuth Telegram (короче /auth/… — меньше шансов 404 на проде). */
export default function TelegramAppBridgePage() {
  return <TelegramAppBridgePageContent />;
}
