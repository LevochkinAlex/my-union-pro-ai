import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPost() {
  await prisma.$connect();
  
  const post = await prisma.userPost.findUnique({
    where: { id: 'cmisx5zws00011y7gqeskb0li' },
    include: {
      attachments: true
    }
  });

  console.log("Post content:");
  console.log(post.content);
  console.log("\nAttachments:");
  console.log(JSON.stringify(post.attachments, null, 2));

  await prisma.$disconnect();
}

checkPost().catch(e => {
  console.error(e);
  process.exit(1);
});
