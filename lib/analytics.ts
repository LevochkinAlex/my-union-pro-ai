/**
 * Analytics tracking for Appeal Bot questions
 */

export interface AppealAnalyticsPayload {
  appealType: "LEGAL" | "ACCOUNTING" | "TECHNICAL" | "OTHER";
  question: string;
  keywords?: string[];
  resolutionTime?: number; // in seconds
}

/**
 * Send analytics data to backend
 */
export async function trackAppealQuestion(payload: AppealAnalyticsPayload) {
  try {
    const response = await fetch("/api/chat/analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn("[analytics] Failed to track question:", await response.text());
      return null;
    }

    const data = await response.json();
    console.log("[analytics] Question tracked successfully");
    return data;
  } catch (error) {
    console.error("[analytics] Error tracking question:", error);
    return null;
  }
}

/**
 * Detect appeal type from question text
 */
export function detectAppealType(
  question: string
): "LEGAL" | "ACCOUNTING" | "TECHNICAL" | "OTHER" {
  const lowerQuestion = question.toLowerCase();

  // Legal keywords
  if (
    /\b(право|юридич|закон|статья|положение|устав|регламент|процедур)\b/.test(
      lowerQuestion
    )
  ) {
    return "LEGAL";
  }

  // Accounting/financial keywords
  if (/\b(взнос|финанс|деньги|оплат|счет|налог|доход|расход)\b/.test(lowerQuestion)) {
    return "ACCOUNTING";
  }

  // Technical keywords
  if (/\b(систем|сайт|приложение|техн|ошибка|баг|не работает|не открыва)\b/.test(lowerQuestion)) {
    return "TECHNICAL";
  }

  return "OTHER";
}

/**
 * Extract keywords from text (simple extraction)
 */
export function extractKeywords(text: string, limit = 5): string[] {
  // Split by spaces and punctuation, filter short words
  const words = text
    .toLowerCase()
    .split(/[\s\-\.,;:!?()]+/)
    .filter((word) => word.length > 4 && !/^\d+$/.test(word))
    .slice(0, limit);

  return [...new Set(words)];
}

