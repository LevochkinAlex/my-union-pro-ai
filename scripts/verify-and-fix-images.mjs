#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const UPLOADS_DIR = '/opt/my-union-pro/public/uploads/posts';

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function verifyAndFixImages() {
  console.log('🔍 Verifying post images...\n');

  const posts = await prisma.userPost.findMany({
    include: {
      attachments: true,
    },
  });

  let fixedCovers = 0;
  let restoredCovers = 0;

  for (const post of posts) {
    // Проверяем coverImage
    if (post.coverImage) {
      let needsFixing = false;
      
      // Если это относительный путь или URL нашего сайта
      if (post.coverImage.startsWith('/uploads/') || 
          post.coverImage.startsWith('https://myunion.pro/uploads/')) {
        const fileName = post.coverImage.split('/').pop();
        const fullPath = path.join(UPLOADS_DIR, fileName);
        const exists = await fileExists(fullPath);
        
        if (!exists) {
          console.log(`❌ Post ${post.id}: Cover image not found: ${fileName}`);
          needsFixing = true;
        }
      }
      
      if (needsFixing) {
        // Попытка восстановить из attachments
        const firstImageAttachment = post.attachments.find(a => a.type === 'image');
        
        if (firstImageAttachment) {
          const attachFileName = firstImageAttachment.filePath.split('/').pop();
          const attachFullPath = path.join(UPLOADS_DIR, attachFileName);
          const attachExists = await fileExists(attachFullPath);
          
          if (attachExists) {
            const newCoverUrl = `https://myunion.pro/uploads/posts/${attachFileName}`;
            await prisma.userPost.update({
              where: { id: post.id },
              data: { coverImage: newCoverUrl },
            });
            console.log(`✅ Post ${post.id}: Restored cover from attachment: ${attachFileName}`);
            restoredCovers++;
          } else {
            // Если attachment тоже не существует, просто очищаем cover
            await prisma.userPost.update({
              where: { id: post.id },
              data: { coverImage: null },
            });
            console.log(`🗑️  Post ${post.id}: Cleared broken cover image`);
            fixedCovers++;
          }
        } else {
          // Нет attachments, просто очищаем
          await prisma.userPost.update({
            where: { id: post.id },
            data: { coverImage: null },
          });
          console.log(`🗑️  Post ${post.id}: Cleared broken cover image (no attachments)`);
          fixedCovers++;
        }
      }
    }
  }

  console.log('\n✅ Verification completed!');
  console.log(`📊 Stats:`);
  console.log(`  - Cover images cleared: ${fixedCovers}`);
  console.log(`  - Cover images restored: ${restoredCovers}`);
}

verifyAndFixImages()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

