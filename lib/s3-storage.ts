/**
 * Надежное хранилище файлов на основе S3-совместимых API
 * Поддерживает: AWS S3, Yandex Object Storage, DigitalOcean Spaces, MinIO и другие
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface S3StorageConfig {
  endpoint?: string; // Endpoint для S3-совместимого хранилища (например, https://storage.yandexcloud.net)
  region: string; // Регион (например, ru-central1 для Yandex, us-east-1 для AWS)
  accessKeyId: string; // Access Key ID
  secretAccessKey: string; // Secret Access Key
  bucket: string; // Имя бакета
  publicUrl?: string; // Публичный URL для доступа к файлам (если бакет публичный)
  forcePathStyle?: boolean; // Использовать path-style URLs (нужно для MinIO и некоторых провайдеров)
}

let s3Client: S3Client | null = null;
let s3Config: S3StorageConfig | null = null;

/**
 * Инициализирует S3 клиент
 */
export function initS3Storage(config: S3StorageConfig) {
  s3Config = config;
  
  s3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle || false,
  });
  
  console.log("[s3-storage] S3 storage initialized", {
    endpoint: config.endpoint || "AWS S3",
    region: config.region,
    bucket: config.bucket,
  });
}

/**
 * Получает конфигурацию из переменных окружения
 */
export function getS3ConfigFromEnv(): S3StorageConfig | null {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const region = process.env.S3_REGION || process.env.AWS_REGION || "ru-central1";
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT;
  const publicUrl = process.env.S3_PUBLIC_URL;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  if (!accessKeyId || !secretAccessKey || !bucket) {
    if (process.env.NODE_ENV === "production") {
      console.error("[s3-storage] S3 credentials not configured");
    }
    return null;
  }

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
    forcePathStyle,
  };
}

/**
 * Инициализирует S3 хранилище из переменных окружения
 */
export function initS3StorageFromEnv() {
  const config = getS3ConfigFromEnv();
  if (config) {
    initS3Storage(config);
  } else {
    console.warn("[s3-storage] S3 storage not configured, file uploads will fail");
  }
}

/**
 * Проверяет, настроено ли S3 хранилище
 */
export function isS3StorageConfigured(): boolean {
  return s3Client !== null && s3Config !== null;
}

/**
 * Загружает файл в S3 хранилище
 */
export async function uploadFileToS3(
  key: string, // Путь к файлу в бакете (например, "posts/image.jpg")
  buffer: Buffer,
  contentType: string,
  options?: {
    cacheControl?: string;
    metadata?: Record<string, string>;
  }
): Promise<string> {
  if (!s3Client || !s3Config) {
    throw new Error("S3 storage is not configured. Set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET environment variables.");
  }

  try {
    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: options?.cacheControl || "public, max-age=31536000, immutable",
      Metadata: options?.metadata,
    });

    await s3Client.send(command);

    // Возвращаем публичный URL или генерируем signed URL
    if (s3Config.publicUrl) {
      // Если бакет публичный, возвращаем прямой URL
      const baseUrl = s3Config.publicUrl.endsWith("/") 
        ? s3Config.publicUrl.slice(0, -1) 
        : s3Config.publicUrl;
      return `${baseUrl}/${key}`;
    } else {
      // Если бакет приватный, возвращаем путь для использования через API endpoint
      return `/api/s3/${key}`;
    }
  } catch (error) {
    console.error("[s3-storage] Upload error:", error);
    throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Получает файл из S3 хранилища
 */
export async function getFileFromS3(key: string): Promise<Buffer> {
  if (!s3Client || !s3Config) {
    throw new Error("S3 storage is not configured");
  }

  try {
    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error("File not found in S3");
    }

    // Преобразуем stream в Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error("[s3-storage] Get file error:", error);
    throw new Error(`Failed to get file from S3: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Проверяет существование файла в S3
 */
export async function fileExistsInS3(key: string): Promise<boolean> {
  if (!s3Client || !s3Config) {
    return false;
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error("[s3-storage] Check file existence error:", error);
    return false;
  }
}

/**
 * Удаляет файл из S3 хранилища
 */
export async function deleteFileFromS3(key: string): Promise<void> {
  if (!s3Client || !s3Config) {
    throw new Error("S3 storage is not configured");
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error("[s3-storage] Delete file error:", error);
    throw new Error(`Failed to delete file from S3: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Генерирует временный signed URL для доступа к приватному файлу
 */
export async function getSignedUrlForFile(key: string, expiresIn: number = 3600): Promise<string> {
  if (!s3Client || !s3Config) {
    throw new Error("S3 storage is not configured");
  }

  try {
    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error("[s3-storage] Generate signed URL error:", error);
    throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Инициализируем при загрузке модуля (только на сервере)
if (typeof window === "undefined") {
  initS3StorageFromEnv();
}

