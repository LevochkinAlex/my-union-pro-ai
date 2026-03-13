/**
 * BestBenefits API token provider for organization endpoints used in discounts catalog.
 * В проекте используется только статический токен из env.
 */
export async function getBestBenefitsToken(): Promise<string> {
  const token = process.env.BB_PROFSOYUZY_TOKEN?.trim();
  if (!token) {
    throw new Error("BB_PROFSOYUZY_TOKEN is not configured");
  }
  return token;
}

/**
 * Совместимость с существующими импортами в старом коде/скриптах.
 */
export function clearBestBenefitsToken(): void {}

