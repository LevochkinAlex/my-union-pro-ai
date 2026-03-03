/**
 * Сбрасывает дату рождения у пользователя по номеру телефона (например после ошибочного 01.01.9999).
 * Использование: pnpm tsx scripts/fix-date-of-birth-by-phone.ts +79032911881
 */
import { prisma } from "../lib/prisma";
import { normalizePhone } from "../lib/utils/phone";

const phone = process.argv[2];
if (!phone) {
  console.error("Укажите номер: pnpm tsx scripts/fix-date-of-birth-by-phone.ts +79032911881");
  process.exit(1);
}

async function main() {
  const normalized = normalizePhone(phone);
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: normalized },
        { phone },
        { authPhone: normalized },
        { authPhone: phone },
      ],
    },
    select: { id: true, phone: true, firstName: true, lastName: true, dateOfBirth: true },
  });

  if (!user) {
    console.error("Пользователь не найден:", phone);
    process.exit(1);
  }

  console.log("Найден:", user.firstName, user.lastName, user.phone, "| dateOfBirth:", user.dateOfBirth);

  if (user.dateOfBirth == null) {
    console.log("Дата рождения уже пустая, ничего не делаем.");
    await prisma.$disconnect();
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { dateOfBirth: null },
  });
  console.log("Дата рождения сброшена (null). Пользователь может ввести корректную дату в профиле.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
