/**
 * Универсальное хранилище файлов
 * Автоматически использует S3, если настроен, иначе VDS
 */

import { uploadFileToS3, isS3StorageConfigured, getFileFromS3, fileExistsInS3, deleteFileFromS3, getSignedUrlForFile } from "./s3-storage";
import { uploadFileToVDS, isVDSStorageConfigured, getFileFromVDS } from "./vds-storage";

/**
 * Загружает файл в хранилище (S3 или VDS)
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
  options?: {
    cacheControl?: string;
    metadata?: Record<string, string>;
  }
): Promise<string> {
  // Приоритет S3, если настроен
  if (isS3StorageConfigured()) {
    return uploadFileToS3(key, buffer, contentType, options);
  }
  
  // Fallback на VDS
  if (isVDSStorageConfigured()) {
    return uploadFileToVDS(key, buffer, contentType);
  }
  
  throw new Error("No storage configured. Set up S3 or VDS storage.");
}

/**
 * Получает файл из хранилища
 */
export async function getFile(key: string): Promise<Buffer> {
  if (isS3StorageConfigured()) {
    return getFileFromS3(key);
  }
  
  if (isVDSStorageConfigured()) {
    return getFileFromVDS(key);
  }
  
  throw new Error("No storage configured");
}

/**
 * Проверяет существование файла
 */
export async function fileExists(key: string): Promise<boolean> {
  if (isS3StorageConfigured()) {
    return fileExistsInS3(key);
  }
  
  // Для VDS всегда возвращаем true, так как проверка сложнее
  if (isVDSStorageConfigured()) {
    return true;
  }
  
  return false;
}

/**
 * Удаляет файл из хранилища
 */
export async function deleteFile(key: string): Promise<void> {
  if (isS3StorageConfigured()) {
    return deleteFileFromS3(key);
  }
  
  // VDS удаление не реализовано, просто игнорируем
  if (isVDSStorageConfigured()) {
    console.warn("[storage] File deletion not implemented for VDS");
    return;
  }
  
  throw new Error("No storage configured");
}

/**
 * Получает URL для доступа к файлу
 */
export async function getFileUrl(key: string, expiresIn?: number): Promise<string> {
  if (isS3StorageConfigured()) {
    // Если нужен signed URL
    if (expiresIn) {
      return getSignedUrlForFile(key, expiresIn);
    }
    // Иначе возвращаем путь для API endpoint
    return `/api/s3/${key}`;
  }
  
  if (isVDSStorageConfigured()) {
    // VDS использует прямой URL
    return key;
  }
  
  throw new Error("No storage configured");
}

