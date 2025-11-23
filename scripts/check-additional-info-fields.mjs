import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkAdditionalInfo(email) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        occupation: true,
        aboutMe: true,
        hobbies: true,
        maritalStatus: true,
        spouseInfo: true,
        hasChildren: true,
        childrenInfo: true,
        additionalInfo: true,
      },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📋 Дополнительная информация для: ${user.firstName} ${user.lastName}`);
    console.log("\n📊 Текущие значения в БД:");
    console.log(`  occupation: "${user.occupation || 'NULL'}"`);
    console.log(`  aboutMe: "${user.aboutMe || 'NULL'}"`);
    console.log(`  hobbies: "${user.hobbies || 'NULL'}"`);
    console.log(`  maritalStatus: "${user.maritalStatus || 'NULL'}"`);
    console.log(`  spouseInfo: "${user.spouseInfo || 'NULL'}"`);
    console.log(`  hasChildren: ${user.hasChildren}`);
    console.log(`  childrenInfo: "${user.childrenInfo || 'NULL'}"`);
    console.log(`  additionalInfo: "${user.additionalInfo || 'NULL'}"`);

    // Проверяем какие поля пустые
    const emptyFields = [];
    if (!user.occupation) emptyFields.push('occupation');
    if (!user.aboutMe) emptyFields.push('aboutMe');
    if (!user.hobbies) emptyFields.push('hobbies');
    if (!user.maritalStatus) emptyFields.push('maritalStatus');
    if (!user.spouseInfo) emptyFields.push('spouseInfo');
    if (!user.childrenInfo) emptyFields.push('childrenInfo');
    if (!user.additionalInfo) emptyFields.push('additionalInfo');

    if (emptyFields.length > 0) {
      console.log(`\n⚠️  Пустые поля: ${emptyFields.join(', ')}`);
    } else {
      console.log('\n✅ Все поля заполнены!');
    }

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdditionalInfo("ceo@yappix.ru");

