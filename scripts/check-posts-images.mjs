#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const prisma = new PrismaClient();

async function checkPostsAndImages() {
  console.log('🔍 Проверка постов и изображений на проде...\n');

  try {
    // Получаем все посты
    const totalPosts = await prisma.userPost.count();
    console.log(`📊 Всего постов в БД: ${totalPosts}`);

    // Посты с обложками
    const postsWithCover = await prisma.userPost.count({
      where: {
        coverImage: { not: null }
      }
    });
    console.log(`📸 Постов с обложками: ${postsWithCover}`);

    // Посты с вложениями
    const postsWithAttachments = await prisma.userPost.count({
      where: {
        attachments: { some: {} }
      }
    });
    console.log(`📎 Постов с вложениями: ${postsWithAttachments}\n`);

    // Получаем последние 10 постов
    const recentPosts = await prisma.userPost.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        attachments: true,
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    console.log('📝 Последние 10 постов:');
    console.log('─'.repeat(80));

    for (const post of recentPosts) {
      console.log(`\n📌 Пост ID: ${post.id}`);
      console.log(`   Автор: ${post.author.firstName} ${post.author.lastName} (${post.author.email})`);
      console.log(`   Создан: ${post.createdAt.toLocaleString('ru-RU')}`);
      console.log(`   Обложка: ${post.coverImage || 'нет'}`);
      console.log(`   Вложений: ${post.attachments.length}`);
      
      if (post.attachments.length > 0) {
        post.attachments.forEach((att, idx) => {
          console.log(`     ${idx + 1}. ${att.originalName} - ${att.filePath}`);
        });
      }
    }

    // Проверяем файлы на VDS
    console.log('\n\n🔍 Проверка файлов на VDS...');
    console.log('─'.repeat(80));

    const vdsHost = process.env.VDS_STORAGE_HOST;
    const vdsUser = process.env.VDS_STORAGE_USER || 'root';
    const vdsPassword = process.env.VDS_PASSWORD;

    if (!vdsHost || !vdsPassword) {
      console.log('⚠️  VDS конфигурация не найдена, пропускаем проверку файлов');
      return;
    }

    // Получаем все уникальные пути к изображениям
    const allPosts = await prisma.userPost.findMany({
      where: {
        OR: [
          { coverImage: { not: null } },
          { attachments: { some: {} } }
        ]
      },
      include: {
        attachments: true
      }
    });

    const imagePaths = new Set();
    
    for (const post of allPosts) {
      if (post.coverImage && !post.coverImage.startsWith('http') && !post.coverImage.startsWith('data:')) {
        imagePaths.add(post.coverImage);
      }
      for (const att of post.attachments) {
        if (att.filePath && !att.filePath.startsWith('http') && !att.filePath.startsWith('data:')) {
          imagePaths.add(att.filePath);
        }
      }
    }

    console.log(`\n📁 Найдено ${imagePaths.size} уникальных путей к файлам`);

    // Проверяем существование файлов на VDS
    let existingFiles = 0;
    let missingFiles = 0;
    const missingPaths = [];

    for (const path of Array.from(imagePaths).slice(0, 20)) { // Проверяем первые 20
      try {
        // Извлекаем имя файла из пути
        const filename = path.split('/').pop();
        const remotePath = `/root/my-union-pro-ai/public/uploads/posts/${filename}`;
        
        const command = `sshpass -p "${vdsPassword}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${vdsUser}@${vdsHost} "test -f ${remotePath} && echo 'EXISTS' || echo 'MISSING'"`;
        
        const result = execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        
        if (result === 'EXISTS') {
          existingFiles++;
          console.log(`✅ ${filename}`);
        } else {
          missingFiles++;
          missingPaths.push(path);
          console.log(`❌ ${filename} - НЕ НАЙДЕН`);
        }
      } catch (error) {
        console.log(`⚠️  Ошибка при проверке ${path}: ${error.message}`);
      }
    }

    console.log(`\n📊 Статистика проверки файлов:`);
    console.log(`   ✅ Существует: ${existingFiles}`);
    console.log(`   ❌ Отсутствует: ${missingFiles}`);

    if (missingPaths.length > 0) {
      console.log(`\n⚠️  Отсутствующие файлы:`);
      missingPaths.forEach(path => console.log(`   - ${path}`));
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

checkPostsAndImages()
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

