import { Prisma } from "@prisma/client";

/**
 * Сообщения об ошибках Prisma для страницы списка партнёров и GET /api/admin/partners.
 * `fallback` — если ошибка не распознана (например, «Ошибка загрузки» vs «Ошибка сохранения»).
 */
export function partnerListPrismaErrorToUserMessage(e: unknown, fallback: string): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2022") {
      return "Схема базы устарела (нет ожидаемой колонки). Выполните: npx prisma migrate deploy";
    }
    if (e.code === "P2021") {
      return "В базе отсутствует ожидаемая таблица. Выполните: npx prisma migrate deploy (или npx prisma db push в dev).";
    }
    if (e.code === "P2002") {
      return "Запись с такими уникальными данными уже существует.";
    }
    return `Ошибка БД (${e.code}). ${e.meta ? JSON.stringify(e.meta) : ""}`.trim();
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    const msg = e.message;
    const staleClientHint =
      /Unknown argument|Unknown field/i.test(msg)
        ? " Частая причина — схема Prisma и сгенерированный @prisma/client разошлись: выполните npx prisma generate (и при необходимости npx prisma migrate deploy), затем перезапустите dev-сервер."
        : "";
    if (process.env.NODE_ENV === "development") {
      return `Некорректные данные для сохранения.${staleClientHint}\n${msg}`;
    }
    return `Некорректные данные для сохранения.${staleClientHint}`;
  }
  if (e instanceof Prisma.PrismaClientInitializationError || e instanceof Prisma.PrismaClientRustPanicError) {
    return "Нет подключения к базе данных. Проверьте DATABASE_URL и доступность сервера БД.";
  }
  if (e instanceof Error) {
    const msg = e.message;
    if (/closed|connection|ECONNREFUSED|timeout/i.test(msg)) {
      return "Соединение с базой данных разорвано. Повторите попытку.";
    }
    if (process.env.NODE_ENV === "development") {
      return msg;
    }
  }
  return fallback;
}

/**
 * Ответ для JSON API партнёрки: понятное сообщение и флаг подсказки про миграции только если текст явно про схему/развёртывание.
 */
export function partnerPrismaErrorSuggestsMigration(message: string): boolean {
  // Только явные признаки «БД без миграции», без общих упоминаний migrate из ValidationError (Unknown field и т.д.).
  return /Схема базы устарела|нет ожидаемой колонки|отсутствует ожидаемая таблица|\bP2021\b|\bP2022\b/i.test(
    message,
  );
}

export function partnerApiPrismaJsonBody(
  e: unknown,
  fallback: string
): { error: string; hintMigration?: true } {
  const error = partnerListPrismaErrorToUserMessage(e, fallback);
  return partnerPrismaErrorSuggestsMigration(error)
    ? { error, hintMigration: true as const }
    : { error };
}
