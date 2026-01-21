/**
 * Генерация blur placeholder для изображений
 * Используется для ленивой загрузки и улучшения UX
 */

import sharp from "sharp";

/**
 * Генерирует base64 blur placeholder для изображения
 * @param buffer - Буфер изображения
 * @param width - Ширина placeholder (по умолчанию 20px)
 * @returns Base64 data URL blur placeholder
 */
export async function generateBlurPlaceholder(
  buffer: Buffer,
  width: number = 20
): Promise<string> {
  try {
    // Создаем очень маленькое размытое изображение
    const placeholder = await sharp(buffer)
      .resize(width, width, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .blur(10) // Размытие
      .webp({ quality: 20 }) // Низкое качество для минимального размера
      .toBuffer();

    // Конвертируем в base64
    const base64 = placeholder.toString("base64");
    return `data:image/webp;base64,${base64}`;
  } catch (error) {
    console.error("[blur-placeholder] Error generating placeholder:", error);
    // Возвращаем простой градиент placeholder в случае ошибки
    return generateGradientPlaceholder();
  }
}

/**
 * Генерирует простой градиент placeholder
 */
function generateGradientPlaceholder(): string {
  // Простой SVG градиент в base64
  const svg = `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#e5e7eb;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#d1d5db;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="20" height="20" fill="url(#grad)" />
  </svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Генерирует thumbnail для изображения
 * @param buffer - Буфер изображения
 * @param maxWidth - Максимальная ширина thumbnail (по умолчанию 300px)
 * @param maxHeight - Максимальная высота thumbnail (по умолчанию 300px)
 * @returns Буфер thumbnail изображения
 */
export async function generateThumbnail(
  buffer: Buffer,
  maxWidth: number = 300,
  maxHeight: number = 300
): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error("[blur-placeholder] Error generating thumbnail:", error);
    throw error;
  }
}
