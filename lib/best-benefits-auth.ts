/**
 * BestBenefits API: статический Bearer для каталога и org API.
 * BB_LOGIN / BB_PASSWORD не используются.
 */
export async function getBestBenefitsToken(): Promise<string> {
  const token =
    process.env.BB_PROFSOYUZY_TOKEN?.trim() || process.env.BB_API_TOKEN?.trim();
  if (!token) {
    throw new Error("BB_PROFSOYUZY_TOKEN (или BB_API_TOKEN) не задан в окружении");
  }
  return token;
}

