import { normalizeBbOrgTokenFromEnv } from "./best-benefits-token-env";

/**
 * BestBenefits API: статический Bearer для каталога и org API.
 * BB_LOGIN / BB_PASSWORD не используются.
 */
export async function getBestBenefitsToken(): Promise<string> {
  const token =
    normalizeBbOrgTokenFromEnv(process.env.BB_PROFSOYUZY_TOKEN) ||
    normalizeBbOrgTokenFromEnv(process.env.BB_API_TOKEN);
  if (!token) {
    throw new Error("BB_PROFSOYUZY_TOKEN (или BB_API_TOKEN) не задан в окружении");
  }
  return token;
}

