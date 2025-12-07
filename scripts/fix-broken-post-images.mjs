#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixBrokenImages() {
  console.log('🔍 Searching for posts with broken images...\n');

  // Получаем все посты с вложениями и обложками
  const posts = await prisma.userPost.findMany({
    include: {
      attachments: true,
    },
  });

  let fixedPosts = 0;
  let deletedAttachments = 0;
  let clearedCovers = 0;

  for (const post of posts) {
    let needsUpdate = false;

    // Проверяем coverImage
    if (post.coverImage) {
      // Если это не HTTP URL и файл содержит старую дату (до декабря 7)
      const isBroken = 
        !post.coverImage.startsWith('http') && 
        !post.coverImage.includes('1765104') && // Dec 7+
        !post.coverImage.includes('1765113'); // Dec 7+
      
      if (isBroken) {
        console.log(`📸 Post ${post.id}: Clearing broken cover image: ${post.coverImage}`);
        await prisma.userPost.update({
          where: { id: post.id },
          data: { coverImage: null },
        });
        clearedCovers++;
        needsUpdate = true;
      }
    }

    // Проверяем attachments
    for (const attachment of post.attachments) {
      const isBroken = 
        attachment.filePath &&
        !attachment.filePath.startsWith('http') && 
        !attachment.filePath.includes('1765104') &&
        !attachment.filePath.includes('1765113');
      
      if (isBroken) {
        console.log(`📎 Post ${post.id}: Deleting broken attachment: ${attachment.filePath}`);
        await prisma.postAttachment.delete({
          where: { id: attachment.id },
        });
        deletedAttachments++;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      fixedPosts++;
    }
  }

  console.log('\n✅ Cleanup completed!');
  console.log(`📊 Stats:`);
  console.log(`  - Posts fixed: ${fixedPosts}`);
  console.log(`  - Cover images cleared: ${clearedCovers}`);
  console.log(`  - Attachments deleted: ${deletedAttachments}`);
}

fixBrokenImages()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

