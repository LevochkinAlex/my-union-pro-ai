#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAvatars() {
  try {
    const users = await prisma.user.findMany({
      where: {
        avatarUrl: { not: null }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true
      },
      take: 5
    });

    console.log('\n=== Пользователи с аватарами ===\n');
    users.forEach(user => {
      console.log(`${user.firstName} ${user.lastName}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  Avatar URL: ${user.avatarUrl}`);
      console.log('');
    });

    console.log(`\nВсего найдено пользователей с аватарами: ${users.length}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAvatars();

