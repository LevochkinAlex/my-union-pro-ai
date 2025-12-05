import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupPost() {
  await prisma.$connect();
  console.log("Connected!");
  
  // Найти посты с broken путями изображений
  const posts = await prisma.userPost.findMany({
    where: {
      OR: [
        { content: { contains: 'generated-1764942382839' } },
        { content: { contains: 'Аллея' } }
      ]
    },
    select: {
      id: true,
      content: true,
      postType: true
    }
  });

  console.log(`Found ${posts.length} posts to check`);

  for (const post of posts) {
    console.log(`\nPost ID: ${post.id}`);
    console.log(`Type: ${post.postType}`);
    console.log(`Content before:\n${post.content.substring(0, 300)}...`);

    // Очистка контента
    let cleanContent = post.content;
    
    // Удаляем строки типа "generated-*.jpg" без пути
    cleanContent = cleanContent.replace(/\bgenerated-\d+\.jpg\b/g, '');
    
    // Удаляем сломанные img теги с неправильным src
    cleanContent = cleanContent.replace(/<img[^>]*src=["'](?!https?:\/\/|\/api\/|\/uploads\/)[^"']*["'][^>]*\/?>/gi, '');
    
    // Удаляем пустые image-wrapper div
    cleanContent = cleanContent.replace(/<div[^>]*class=["']image-wrapper["'][^>]*>\s*(<button[^>]*>[^<]*<\/button>)?\s*<\/div>/gi, '');
    
    // Удаляем пустые параграфы
    cleanContent = cleanContent.replace(/<p>\s*<\/p>/gi, '');
    cleanContent = cleanContent.replace(/<p><br\s*\/?><\/p>/gi, '');
    
    // Удаляем множественные переносы строк
    cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n');
    
    // Удаляем лишние пробелы
    cleanContent = cleanContent.trim();

    if (cleanContent !== post.content) {
      console.log(`Content after:\n${cleanContent.substring(0, 300)}...`);
      
      await prisma.userPost.update({
        where: { id: post.id },
        data: { content: cleanContent }
      });
      console.log('✓ Post cleaned!');
    } else {
      console.log('No changes needed');
    }
  }

  // Проверим PostAttachment на сломанные пути
  const brokenAttachments = await prisma.postAttachment.findMany({
    where: {
      AND: [
        { filePath: { not: { startsWith: '/' } } },
        { filePath: { not: { startsWith: 'http' } } }
      ]
    },
    select: {
      id: true,
      filePath: true,
      postId: true
    }
  });

  console.log(`\nFound ${brokenAttachments.length} broken attachments`);
  for (const att of brokenAttachments) {
    console.log(`Deleting broken attachment: ${att.id} - ${att.filePath}`);
    await prisma.postAttachment.delete({ where: { id: att.id } });
  }

  await prisma.$disconnect();
}

cleanupPost()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
