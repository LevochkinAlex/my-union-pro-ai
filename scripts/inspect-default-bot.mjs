import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const bot = await prisma.chatBot.findFirst({
    where: { isDefault: true },
    include: {
      knowledgeBases: {
        include: {
          knowledgeBase: true,
        },
      },
      apiProvider: true,
    },
  });

  console.dir(bot, { depth: 5 });
}

main()
  .catch((err) => {
    console.error(err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
