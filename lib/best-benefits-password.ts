/**
 * Утилиты для шифрования/дешифрования пароля BestBenefits
 * 
 * Пароль хранится в БД в зашифрованном виде (AES-256-GCM)
 * для использования при синхронизации с BestBenefits API
 */

import crypto from "crypto";

const ENCRYPTION_KEY = process.env.BB_PASSWORD_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "default-key-change-in-production-32-chars!!";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // For AES, this is always 16
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

/**
 * Получить ключ шифрования из ENCRYPTION_KEY
 */
function getKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
}

/**
 * Шифрует пароль для хранения в БД
 */
export function encryptPassword(password: string): string {
  if (!password) {
    throw new Error("Password cannot be empty");
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(salt);

  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Сохраняем: salt + iv + tag + encrypted
  return salt.toString("hex") + iv.toString("hex") + tag.toString("hex") + encrypted;
}

/**
 * Расшифровывает пароль из БД
 */
export function decryptPassword(encryptedPassword: string): string {
  if (!encryptedPassword) {
    throw new Error("Encrypted password cannot be empty");
  }

  const key = getKey();

  // Извлекаем компоненты
  const salt = Buffer.from(encryptedPassword.substring(0, SALT_LENGTH * 2), "hex");
  const iv = Buffer.from(
    encryptedPassword.substring(SALT_LENGTH * 2, TAG_POSITION * 2),
    "hex"
  );
  const tag = Buffer.from(
    encryptedPassword.substring(TAG_POSITION * 2, ENCRYPTED_POSITION * 2),
    "hex"
  );
  const encrypted = encryptedPassword.substring(ENCRYPTED_POSITION * 2);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(salt);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Проверяет, является ли строка зашифрованным паролем
 */
export function isEncrypted(password: string): boolean {
  if (!password || password.length < ENCRYPTED_POSITION * 2) {
    return false;
  }
  // Проверяем формат (hex строки)
  return /^[0-9a-f]+$/i.test(password);
}

