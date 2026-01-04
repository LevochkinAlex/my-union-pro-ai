/**
 * Скрипт для генерации иконок PWA и badge для уведомлений
 * Запуск: node scripts/generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../public');
const SOURCE_ICON = path.join(PUBLIC_DIR, 'icon-512x512.png');

// Размеры для обычных иконок
const ICON_SIZES = [72, 96, 128, 144, 192, 512];

// Размеры для maskable иконок (с padding)
const MASKABLE_SIZES = [192, 512];

// Badge для уведомлений (монохромный)
const BADGE_SIZE = 96;

async function generateIcons() {
  console.log('🎨 Генерация иконок PWA...\n');

  // Проверяем существование исходной иконки
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('❌ Исходная иконка не найдена:', SOURCE_ICON);
    process.exit(1);
  }

  // Генерируем обычные иконки
  for (const size of ICON_SIZES) {
    const outputPath = path.join(PUBLIC_DIR, `icon-${size}x${size}.png`);
    
    // Пропускаем если уже существует и размер правильный
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  icon-${size}x${size}.png уже существует`);
      continue;
    }

    await sharp(SOURCE_ICON)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    
    console.log(`✅ icon-${size}x${size}.png создан`);
  }

  // Генерируем maskable иконки (с padding 10%)
  for (const size of MASKABLE_SIZES) {
    const outputPath = path.join(PUBLIC_DIR, `icon-maskable-${size}x${size}.png`);
    
    if (fs.existsSync(outputPath)) {
      console.log(`⏭️  icon-maskable-${size}x${size}.png уже существует`);
      continue;
    }

    const innerSize = Math.round(size * 0.8); // 80% от размера (20% padding)
    const padding = Math.round(size * 0.1);

    // Создаем иконку с padding
    const resizedIcon = await sharp(SOURCE_ICON)
      .resize(innerSize, innerSize, { fit: 'contain' })
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 59, g: 130, b: 246, alpha: 1 } // theme_color: #3b82f6
      }
    })
      .composite([{ input: resizedIcon, left: padding, top: padding }])
      .png()
      .toFile(outputPath);
    
    console.log(`✅ icon-maskable-${size}x${size}.png создан`);
  }

  // Генерируем монохромный badge для уведомлений
  const badgePath = path.join(PUBLIC_DIR, `badge-${BADGE_SIZE}x${BADGE_SIZE}.png`);
  
  // Создаем белую монохромную версию иконки
  await sharp(SOURCE_ICON)
    .resize(BADGE_SIZE, BADGE_SIZE, { fit: 'contain' })
    .greyscale()
    .threshold(128) // Конвертируем в черно-белый
    .negate() // Инвертируем (белый на прозрачном)
    .png()
    .toFile(badgePath);
  
  console.log(`✅ badge-${BADGE_SIZE}x${BADGE_SIZE}.png (монохромный) создан`);

  console.log('\n🎉 Генерация иконок завершена!');
}

generateIcons().catch(console.error);

