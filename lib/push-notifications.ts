/**
 * Server-side push: вызывает внутренний API отправки уведомлений.
 */

export async function sendPushNotification(
  userId: string,
  options: {
    title: string;
    body: string;
    url?: string;
  }
): Promise<void> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    const response = await fetch(`${baseUrl}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.INTERNAL_API_TOKEN || "",
      },
      body: JSON.stringify({
        userId,
        title: options.title,
        message: options.body,
        data: options.url ? { url: options.url } : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Push] Failed to send notification:", response.status, errorText);
    }
  } catch (error) {
    console.error("[Push] Error sending notification:", error);
  }
}
