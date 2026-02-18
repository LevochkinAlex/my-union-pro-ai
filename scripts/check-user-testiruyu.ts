/**
 * Проверка аккаунта "Тестирую": награды, дополнительная информация и связанные поля
 *
 * Usage: pnpm dotenv -e .env -- tsx scripts/check-user-testiruyu.ts
 */

import { prisma } from "../lib/prisma";

async function main() {
  const name = "Тестирую";

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { firstName: { equals: name, mode: "insensitive" } },
        { lastName: { equals: name, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      membershipStatus: true,
      awards: true,
      additionalInfo: true,
      hobbies: true,
      aboutMe: true,
      training: true,
      professions: true,
      educations: true,
      employmentStatus: true,
      maritalStatus: true,
      childrenInfo: true,
      spouseInfo: true,
      profileLastModified: true,
      updatedAt: true,
    },
  });

  if (!user) {
    console.log(`\n❌ Пользователь с именем "${name}" не найден.\n`);
    return;
  }

  console.log("\n" + "═".repeat(60));
  console.log("👤 АККАУНТ: Тестирую");
  console.log("═".repeat(60));
  console.log(`ID: ${user.id}`);
  console.log(`Email: ${user.email ?? "—"}`);
  console.log(`ФИО: ${user.lastName ?? ""} ${user.firstName ?? ""} ${user.middleName ?? ""}`);
  console.log(`Статус членства: ${user.membershipStatus}`);
  console.log(`Обновлён: ${user.updatedAt?.toISOString() ?? "—"}`);
  console.log("");

  console.log("🏆 Награды (awards):");
  if (user.awards && user.awards.trim() !== "") {
    try {
      const parsed = JSON.parse(user.awards);
      if (Array.isArray(parsed)) {
        console.log(`   Записей: ${parsed.length}`);
        parsed.forEach((a: any, i: number) => {
          console.log(`   ${i + 1}. ${a.type ?? "—"}, ${a.year ?? "—"}, ${(a.description ?? "").slice(0, 50)}...`);
        });
      } else {
        console.log("   (не массив):", user.awards.slice(0, 100));
      }
    } catch {
      console.log("   (сырая строка):", user.awards.slice(0, 200));
    }
  } else {
    console.log("   ❌ Пусто или не заполнено");
  }

  console.log("");
  console.log("📝 Дополнительная информация (additionalInfo):");
  if (user.additionalInfo && user.additionalInfo.trim() !== "") {
    console.log("   Длина:", user.additionalInfo.length, "символов");
    console.log("   Превью:", user.additionalInfo.slice(0, 150) + (user.additionalInfo.length > 150 ? "..." : ""));
  } else {
    console.log("   ❌ Пусто или не заполнено");
  }

  console.log("");
  console.log("О себе (aboutMe):", user.aboutMe ? `${user.aboutMe.slice(0, 80)}...` : "—");
  console.log("Хобби (hobbies):", user.hobbies || "—");
  console.log("Обучение (training):", user.training ? `${user.training.length} символов` : "—");
  console.log("Профессии (professions):", user.professions ? `${user.professions.length} символов` : "—");
  console.log("Образования (educations):", user.educations ? `${user.educations.length} символов` : "—");
  console.log("");
  console.log("═".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
