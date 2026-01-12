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
    const phone = "+79775233556";
    const targetOrgName = "ППО Аппарат МООП РЗ РФ";

    console.log(`🔍 Ищу пользователя с телефоном: ${phone}`);
    
    // Ищем пользователя
    const user = await prisma.user.findUnique({
      where: { phone },
      include: {
        organization: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с телефоном ${phone} не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`, {
      id: user.id,
      name: `${user.lastName || ""} ${user.firstName || ""} ${user.middleName || ""}`.trim(),
      email: user.email,
      currentOrg: user.organization?.name || "не указана",
      currentOrgId: user.organizationId,
    });

    // Ищем целевую организацию
    console.log(`\n🔍 Ищу организацию: ${targetOrgName}`);
    const targetOrg = await prisma.organization.findFirst({
      where: {
        name: {
          contains: targetOrgName,
          mode: "insensitive",
        },
        isActive: true,
      },
    });

    if (!targetOrg) {
      console.error(`❌ Организация "${targetOrgName}" не найдена`);
      console.log(`\n📋 Доступные организации с "Аппарат":`);
      const similarOrgs = await prisma.organization.findMany({
        where: {
          name: {
            contains: "Аппарат",
            mode: "insensitive",
          },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          type: true,
        },
      });
      similarOrgs.forEach(org => {
        console.log(`  - ${org.name} (${org.type}, id: ${org.id})`);
      });
      process.exit(1);
    }

    console.log(`✅ Организация найдена:`, {
      id: targetOrg.id,
      name: targetOrg.name,
      type: targetOrg.type,
    });

    // Переносим пользователя
    console.log(`\n🔄 Переношу пользователя в организацию...`);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        organizationId: targetOrg.id,
      },
      include: {
        organization: true,
      },
    });

    console.log(`✅ Пользователь успешно перенесен!`);
    console.log(`📊 Новые данные:`, {
      userId: updatedUser.id,
      userName: `${updatedUser.lastName || ""} ${updatedUser.firstName || ""} ${updatedUser.middleName || ""}`.trim(),
      newOrg: updatedUser.organization?.name,
      newOrgId: updatedUser.organizationId,
    });
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
