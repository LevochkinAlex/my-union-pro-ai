/** Только цифры, обрезка по максимальной длине */
export function partnerRequisitesDigits(value: string, maxLen: number): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}

/**
 * Пустое поле или полная длина: ИНН 10/12, ОГРН 13 или ОГРНИП 15, КПП 9.
 */
export function arePartnerRequisitesValid(inn: string, ogrn: string, kpp: string): boolean {
  const innOk = inn.length === 0 || inn.length === 10 || inn.length === 12;
  const ogrnOk = ogrn.length === 0 || ogrn.length === 13 || ogrn.length === 15;
  const kppOk = kpp.length === 0 || kpp.length === 9;
  return innOk && ogrnOk && kppOk;
}

export const PARTNER_INN_MAX = 12;
export const PARTNER_OGRN_MAX = 15;
export const PARTNER_KPP_MAX = 9;

/** ИНН заполнен полностью: 10 или 12 цифр */
export function isPartnerInnComplete(inn: string): boolean {
  return inn.length === 10 || inn.length === 12;
}

/** Непустой email с базовой проверкой формата */
export function isLooseEmailValid(email: string): boolean {
  const t = email.trim();
  if (!t) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
