import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("🔄 Migrating avatar URLs to API route format...");

    // Find all users with avatar URLs starting with /uploads/avatars/
    const users = await prisma.user.findMany({
      where: {
        avatarUrl: {
          startsWith: "/uploads/avatars/",
        },
      },
      select: {
        id: true,
        avatarUrl: true,
      },
    });

    console.log(`Found ${users.length} users with old avatar URLs`);

    let updated = 0;
    for (const user of users) {
      if (user.avatarUrl) {
        // Extract filename from old URL: /uploads/avatars/filename.jpg
        const filename = user.avatarUrl.replace("/uploads/avatars/", "");
        const newUrl = `/api/uploads/avatars/${filename}`;

        await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: newUrl },
        });

        console.log(`✅ Updated: ${user.avatarUrl} -> ${newUrl}`);
        updated++;
      }
    }

    console.log(`\n✨ Migration complete! Updated ${updated} avatar URLs`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

