#!/usr/bin/env node

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../lib/best-benefits-password';
import { getUserBestBenefitsToken } from '../lib/best-benefits-user-auth';

const prisma = new PrismaClient();

async function checkLentaDiscount() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'talik.e@mail.ru' },
      select: {
        id: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user || !user.bestBenefitsPassword) {
      console.log('User not found or no password');
      return;
    }

    const password = decryptPassword(user.bestBenefitsPassword);
    const token = await getUserBestBenefitsToken(user.bestBenefitsUserId!, password);

    const response = await fetch('https://bestbenefits.ru/api/received', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    const data = await response.json();
    const lenta = data.data?.find((p: any) => p.id === 1817);

    console.log('\n📋 Данные скидки Лента (ID 1817):\n');
    console.log(JSON.stringify(lenta, null, 2));

    if (lenta?.codes) {
      console.log('\n🔍 Коды:\n');
      lenta.codes.forEach((code: any, idx: number) => {
        console.log(`  ${idx + 1}. ID: ${code.id}`);
        console.log(`     Code: ${code.code}`);
        console.log(`     End Date: ${code.end_date}`);
        console.log('');
      });
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkLentaDiscount();

