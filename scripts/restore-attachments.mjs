#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const UPLOADS_DIR = '/opt/my-union-pro/public/uploads/posts';

async function getExistingFiles() {
  const files = await fs.readdir(UPLOADS_DIR);
  return files.filter(f => !f.startsWith('cover-')); // Исключаем cover файлы
}

async function restoreAttachments() {
  console.log('🔍 Проверяем посты и файлы...\n');

  const files = await getExistingFiles();
  console.log(`📁 Найдено файлов: ${files.length}`);
  
  // Получаем все посты
  const posts = await prisma.userPost.findMany({
    include: { attachments: true },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`📝 Всего постов: ${posts.length}\n`);
  
  // Получаем все существующие attachments
  const existingAttachments = await prisma.postAttachment.findMany();
  const existingPaths = new Set(existingAttachments.map(a => a.filePath.split('/').pop()));
  
  console.log(`📎 Существующих attachments: ${existingAttachments.length}`);
  
  // Находим файлы, которых нет в attachments
  const orphanFiles = files.filter(f => !existingPaths.has(f));
  console.log(`🔴 Файлов без записей в БД: ${orphanFiles.length}`);
  
  if (orphanFiles.length > 0) {
    console.log('\nОсиротевшие файлы:');
    orphanFiles.forEach(f => console.log(`  - ${f}`));
  }
  
  // Посты без attachments и без coverImage
  const emptyPosts = posts.filter(p => p.attachments.length === 0 && !p.coverImage);
  console.log(`\n📭 Постов без вложений и обложки: ${emptyPosts.length}`);
  
  // Попробуем сопоставить файлы по timestamp с постами
  console.log('\n🔄 Пытаемся восстановить связи...\n');
  
  let restored = 0;
  
  for (const file of orphanFiles) {
    // Извлекаем timestamp из имени файла
    const match = file.match(/^(\d+)-/);
    if (!match) continue;
    
    const fileTimestamp = parseInt(match[1]);
    const fileDate = new Date(fileTimestamp);
    
    // Ищем пост, созданный примерно в это время (±5 минут)
    const matchingPost = posts.find(p => {
      const postDate = new Date(p.createdAt);
      const diff = Math.abs(postDate.getTime() - fileDate.getTime());
      return diff < 5 * 60 * 1000; // 5 минут
    });
    
    if (matchingPost) {
      // Определяем тип файла
      const ext = path.extname(file).toLowerCase();
      let fileType = 'file';
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'].includes(ext)) {
        fileType = 'image';
      } else if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
        fileType = 'video';
      }
      
      // Получаем размер файла
      const stats = await fs.stat(path.join(UPLOADS_DIR, file));
      
      // Проверяем, не существует ли уже attachment
      const exists = matchingPost.attachments.some(a => a.filePath.includes(file));
      if (exists) continue;
      
      // Создаем attachment
      await prisma.postAttachment.create({
        data: {
          postId: matchingPost.id,
          type: fileType,
          filePath: `/uploads/posts/${file}`,
          fileName: file,
          originalName: file,
          fileSize: stats.size,
          mimeType: fileType === 'image' ? `image/${ext.slice(1)}` : 'application/octet-stream'
        }
      });
      
      console.log(`✅ Восстановлен: ${file} → Post ${matchingPost.id}`);
      restored++;
    }
  }
  
  // Также восстановим coverImage для постов
  const coverFiles = (await fs.readdir(UPLOADS_DIR)).filter(f => f.startsWith('cover-'));
  console.log(`\n🖼️ Cover файлов: ${coverFiles.length}`);
  
  let restoredCovers = 0;
  for (const coverFile of coverFiles) {
    const match = coverFile.match(/^cover-(\d+)-/);
    if (!match) continue;
    
    const fileTimestamp = parseInt(match[1]);
    const fileDate = new Date(fileTimestamp);
    
    // Ищем пост без coverImage
    const matchingPost = posts.find(p => {
      if (p.coverImage) return false;
      const postDate = new Date(p.createdAt);
      const diff = Math.abs(postDate.getTime() - fileDate.getTime());
      return diff < 5 * 60 * 1000;
    });
    
    if (matchingPost) {
      await prisma.userPost.update({
        where: { id: matchingPost.id },
        data: { coverImage: `https://myunion.pro/uploads/posts/${coverFile}` }
      });
      console.log(`✅ Cover восстановлен: ${coverFile} → Post ${matchingPost.id}`);
      restoredCovers++;
    }
  }
  
  console.log(`\n📊 Итого:`);
  console.log(`  - Восстановлено attachments: ${restored}`);
  console.log(`  - Восстановлено covers: ${restoredCovers}`);
}

restoreAttachments()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

