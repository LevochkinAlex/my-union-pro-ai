import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanup() {
  await prisma.$connect();
  
  // Удаляем вложения-изображения для статей, которые не встроены в HTML
  const articlePosts = await prisma.userPost.findMany({
    where: { postType: "article" },
    include: { attachments: true }
  });

  console.log(`Found ${articlePosts.length} articles`);

  for (const post of articlePosts) {
    const imageAttachments = post.attachments.filter(a => a.type === "image");
    
    for (const attachment of imageAttachments) {
      // Проверяем, есть ли ссылка на это изображение в HTML контенте
      const isInContent = post.content.includes(attachment.filePath) || 
                          post.content.includes(attachment.fileName);
      
      if (!isInContent) {
        console.log(`\nDeleting orphaned attachment from article "${post.id}":`);
        console.log(`  - ${attachment.originalName} (${attachment.filePath})`);
        
        await prisma.postAttachment.delete({
          where: { id: attachment.id }
        });
        console.log("  ✓ Deleted");
      }
    }
  }

  await prisma.$disconnect();
  console.log("\nDone!");
}

cleanup().catch(e => {
  console.error(e);
  process.exit(1);
});
