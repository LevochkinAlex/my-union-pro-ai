#!/usr/bin/env node
/**
 * Скрипт для генерации иконок разных размеров из icon.png
 * 
 * Требования:
 * - sharp: npm install -g sharp или npm install sharp
 * 
 * Использование:
 * node scripts/generate-icons.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Пути к файлам
const publicDir = path.join(__dirname, '..', 'public');
const sourceIcon = path.join(publicDir, 'icon.png');
const outputIcons = {
  'favicon-16x16.png': { width: 16, height: 16 },
  'favicon-32x32.png': { width: 32, height: 32 },
  'apple-touch-icon.png': { width: 180, height: 180 },
  'icon-192x192.png': { width: 192, height: 192 },
  'icon-512x512.png': { width: 512, height: 512 },
};

async function generateIcons() {
  try {
    // Проверяем наличие sharp
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (error) {
      console.error('❌ Ошибка: sharp не установлен');
      console.log('📦 Установите sharp:');
      console.log('   npm install sharp');
      console.log('   или');
      console.log('   pnpm add sharp');
      process.exit(1);
    }

    // Проверяем наличие исходной иконки
    if (!fs.existsSync(sourceIcon)) {
      console.error(`❌ Исходный файл не найден: ${sourceIcon}`);
      console.log('📝 Убедитесь, что файл icon.png находится в папке public/');
      process.exit(1);
    }

    console.log('🔄 Генерация иконок из:', sourceIcon);
    console.log('📁 Выходная директория:', publicDir);
    console.log('');

    // Генерируем каждую иконку
    for (const [filename, { width, height }] of Object.entries(outputIcons)) {
      const outputPath = path.join(publicDir, filename);
      
      try {
        await sharp(sourceIcon)
          .resize(width, height, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 },
          })
          .png()
          .toFile(outputPath);
        
        console.log(`✅ ${filename} (${width}x${height})`);
      } catch (error) {
        console.error(`❌ Ошибка при создании ${filename}:`, error.message);
      }
    }

    // Создаем favicon.ico (16x16 и 32x32 в одном файле)
    try {
      const favicon16 = await sharp(sourceIcon)
        .resize(16, 16, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();

      const favicon32 = await sharp(sourceIcon)
        .resize(32, 32, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();

      // Для простоты, используем 32x32 как favicon.ico
      // В production лучше использовать специализированный инструмент для создания .ico
      await fs.promises.writeFile(
        path.join(publicDir, 'favicon.ico'),
        favicon32
      );
      console.log('✅ favicon.ico (32x32)');
    } catch (error) {
      console.error('❌ Ошибка при создании favicon.ico:', error.message);
    }

    // Создаем manifest.json для PWA
    const manifest = {
      name: 'MyUnion Pro',
      short_name: 'MyUnion',
      description: 'Единая панель управления профсоюзом',
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#ffffff',
      theme_color: '#3b82f6',
      icons: [
        {
          src: '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    };

    await fs.promises.writeFile(
      path.join(publicDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    console.log('✅ manifest.json');

    console.log('');
    console.log('✨ Все иконки успешно созданы!');
    console.log('');
    console.log('📋 Созданные файлы:');
    console.log('   - favicon.ico');
    console.log('   - favicon-16x16.png');
    console.log('   - favicon-32x32.png');
    console.log('   - apple-touch-icon.png');
    console.log('   - icon-192x192.png');
    console.log('   - icon-512x512.png');
    console.log('   - manifest.json');
    console.log('');
    console.log('💡 Теперь обновите страницу в браузере, чтобы увидеть новые иконки!');
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  }
}

generateIcons();

