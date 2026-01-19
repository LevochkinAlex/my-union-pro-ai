#!/usr/bin/env node

/**
 * Скрипт для безопасного обновления пакетов
 * Обновляет только минорные и патч версии (безопасные обновления)
 */

import { execSync } from 'child_process';
import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

console.log('📦 План обновления пакетов\n');

// Критичные обновления (безопасные минорные/патч версии)
const safeUpdates = {
  // Core framework
  'next': '^16.1.3',
  'eslint-config-next': '^16.1.3',
  
  // Security & Monitoring
  '@sentry/nextjs': '^10.35.0',
  
  // Database
  '@prisma/client': '^6.19.2', // Осторожно: 7.x - мажорное обновление
  'prisma': '^6.19.2',
  
  // UI Libraries
  'tailwindcss': '^4.1.18',
  '@tailwindcss/postcss': '^4.1.18',
  '@tailwindcss/forms': '^0.5.11',
  
  // Type definitions
  '@types/react': '^19.2.8',
  '@types/react-dom': '^19.2.3',
  '@types/node': '^20.19.30',
  '@types/nodemailer': '^7.0.5',
  
  // Utilities
  'eslint': '^9.39.2',
  'rimraf': '^6.1.2',
  'nodemailer': '^7.0.12',
  'jsbarcode': '^3.12.3',
  'react-easy-crop': '^5.5.6',
  'shaders': '^2.2.45',
  'bullmq': '^5.66.5',
  'file-type': '^21.3.0',
  'firebase': '^12.8.0',
  'ioredis': '^5.9.2',
  'puppeteer': '^24.35.0',
  'react-hook-form': '^7.71.1',
  'react-virtuoso': '^4.18.1',
  'tinymce': '^8.3.2',
};

// Мажорные обновления (требуют тестирования)
const majorUpdates = {
  '@ai-sdk/openai': '^3.0.12', // 2.x -> 3.x
  'ai': '^6.0.41', // 5.x -> 6.x
  '@prisma/client': '^7.2.0', // 6.x -> 7.x (BREAKING!)
  'prisma': '^7.2.0', // 6.x -> 7.x (BREAKING!)
};

console.log('✅ Безопасные обновления (минорные/патч версии):');
Object.entries(safeUpdates).forEach(([pkg, version]) => {
  const current = packageJson.dependencies[pkg] || packageJson.devDependencies[pkg];
  if (current) {
    console.log(`  - ${pkg}: ${current} -> ${version}`);
  }
});

console.log('\n⚠️  Мажорные обновления (требуют тестирования):');
Object.entries(majorUpdates).forEach(([pkg, version]) => {
  const current = packageJson.dependencies[pkg] || packageJson.devDependencies[pkg];
  if (current) {
    console.log(`  - ${pkg}: ${current} -> ${version}`);
  }
});

console.log('\n📝 Рекомендации:');
console.log('1. Сначала обновите безопасные версии');
console.log('2. Протестируйте приложение после обновления');
console.log('3. Мажорные обновления (особенно Prisma 7.x) требуют отдельного тестирования');
console.log('4. Prisma 7.x имеет breaking changes - проверьте миграции');

console.log('\n🚀 Для обновления безопасных версий выполните:');
console.log('pnpm update ' + Object.keys(safeUpdates).join(' '));
