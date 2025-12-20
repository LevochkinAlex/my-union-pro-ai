#!/usr/bin/env node

/**
 * Скрипт для регенерации/обновления промокодов для всех пользователей
 * 
 * Проходит по всем пользователям с BestBenefits паролем,
 * запрашивает актуальные промокоды из BestBenefits API,
 * и обновляет записи в базе данных
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// === Шифрование/Дешифрование пароля ===
const ENCRYPTION_KEY = process.env.BB_ENCRYPTION_KEY || process.env.BEST_BENEFITS_ENCRYPTION_KEY || 'default-32-char-key-for-bb-pass!';

function decryptPassword(encrypted) {
  if (!encrypted) return null;
  
  try {
    // Проверяем формат данных
    if (!encrypted.includes(':')) {
      console.warn('Invalid encrypted format (no separator)');
      return null;
    }
    
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      console.warn('Invalid encrypted format (wrong parts count):', parts.length);
      return null;
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
    
    // Создаем ключ из строки
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedBuffer, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt password:', error.message);
    return null;
  }
}

// === BestBenefits API ===
const BEST_BENEFITS_API = 'https://bestbenefits.ru/api';

async function getUserBestBenefitsToken(email, password) {
  const response = await fetch(`${BEST_BENEFITS_API}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  return data.data?.token || data.token;
}

async function getUserActivatedDiscounts(email, password) {
  const token = await getUserBestBenefitsToken(email, password);
  
  const response = await fetch(`${BEST_BENEFITS_API}/received`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get activated discounts: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  const products = data.data || data.products || [];
  
  // Извлекаем промокоды
  return products.map(p => {
    let promoCode = null;
    
    if (p.codes && Array.isArray(p.codes) && p.codes.length > 0) {
      // Находим первый активный код
      const activeCode = p.codes.find(c => {
        const code = c?.code || c?.promo_code || c?.promoCode;
        if (!code || code.toLowerCase() === 'null' || code === 'Промокод деактивирован') {
          return false;
        }
        // Проверяем дату
        const endDate = c?.end_date || c?.endDate;
        if (endDate) {
          const exp = new Date(endDate);
          if (exp < new Date()) return false;
        }
        return true;
      });
      
      if (activeCode) {
        promoCode = activeCode.code || activeCode.promo_code || activeCode.promoCode;
      }
    } else if (p.promo_code) {
      promoCode = p.promo_code;
    } else if (p.promoCode) {
      promoCode = p.promoCode;
    } else if (p.code) {
      promoCode = p.code;
    }
    
    return {
      id: parseInt(p.id),
      promoCode: promoCode?.trim() || null,
      name: p.name || null,
    };
  }).filter(p => p.id);
}

// === Главная функция ===
async function regenerateAllPromoCodes() {
  console.log('🔄 Начинаем регенерацию промокодов для всех пользователей...\n');
  
  // Получаем всех пользователей с BestBenefits паролем
  const users = await prisma.user.findMany({
    where: {
      bestBenefitsPassword: { not: null },
      bestBenefitsUserId: { not: null },
    },
    select: {
      id: true,
      email: true,
      bestBenefitsUserId: true,
      bestBenefitsPassword: true,
    },
  });
  
  console.log(`📊 Найдено ${users.length} пользователей с BestBenefits аккаунтом\n`);
  
  let totalUpdated = 0;
  let totalErrors = 0;
  const results = [];
  
  for (const user of users) {
    console.log(`\n👤 Обработка пользователя: ${user.email}`);
    
    try {
      // Расшифровываем пароль
      const password = decryptPassword(user.bestBenefitsPassword);
      if (!password) {
        console.log(`   ⚠️ Не удалось расшифровать пароль`);
        results.push({ email: user.email, status: 'error', message: 'Decrypt failed' });
        totalErrors++;
        continue;
      }
      
      // Получаем активированные скидки из BestBenefits
      console.log(`   🔍 Запрашиваем скидки из BestBenefits...`);
      const bbDiscounts = await getUserActivatedDiscounts(user.bestBenefitsUserId, password);
      console.log(`   📋 Найдено ${bbDiscounts.length} активированных скидок`);
      
      if (bbDiscounts.length === 0) {
        console.log(`   ℹ️ Нет активированных скидок`);
        results.push({ email: user.email, status: 'ok', updated: 0 });
        continue;
      }
      
      // Обновляем записи в DiscountActivation
      let updatedCount = 0;
      
      for (const bbDiscount of bbDiscounts) {
        if (!bbDiscount.promoCode) {
          continue;
        }
        
        // Обновляем или создаем запись активации
        await prisma.discountActivation.upsert({
          where: {
            userId_discountId: {
              userId: user.id,
              discountId: bbDiscount.id,
            },
          },
          create: {
            userId: user.id,
            discountId: bbDiscount.id,
            promoCode: bbDiscount.promoCode,
            activatedAt: new Date(),
            syncedFromBB: true,
            lastSyncedAt: new Date(),
          },
          update: {
            promoCode: bbDiscount.promoCode,
            syncedFromBB: true,
            lastSyncedAt: new Date(),
          },
        });
        
        console.log(`   ✅ Скидка ${bbDiscount.id}: ${bbDiscount.promoCode}`);
        updatedCount++;
      }
      
      // Также обновляем DiscountPreference (для обратной совместимости)
      const preference = await prisma.discountPreference.findUnique({
        where: { userId: user.id },
      });
      
      if (preference) {
        const filters = (preference.filters || {});
        const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];
        
        // Создаем мапу промокодов
        const promoMap = new Map();
        bbDiscounts.forEach(d => {
          if (d.promoCode) {
            promoMap.set(d.id, d.promoCode);
          }
        });
        
        // Обновляем claimed
        const updatedClaimed = claimed.map(item => {
          const id = typeof item === 'object' ? item.id : item;
          const existingPromo = typeof item === 'object' ? item.promoCode : null;
          
          if (promoMap.has(id)) {
            return { id, promoCode: promoMap.get(id) };
          }
          return { id, promoCode: existingPromo };
        });
        
        // Добавляем новые скидки из BB, которых нет в claimed
        const claimedIds = new Set(updatedClaimed.map(c => c.id));
        for (const bbDiscount of bbDiscounts) {
          if (!claimedIds.has(bbDiscount.id) && bbDiscount.promoCode) {
            updatedClaimed.push({
              id: bbDiscount.id,
              promoCode: bbDiscount.promoCode,
            });
          }
        }
        
        await prisma.discountPreference.update({
          where: { userId: user.id },
          data: {
            filters: {
              ...filters,
              claimed: updatedClaimed,
            },
          },
        });
      }
      
      totalUpdated += updatedCount;
      results.push({ email: user.email, status: 'ok', updated: updatedCount });
      console.log(`   📊 Обновлено ${updatedCount} промокодов`);
      
    } catch (error) {
      console.log(`   ❌ Ошибка: ${error.message}`);
      results.push({ email: user.email, status: 'error', message: error.message });
      totalErrors++;
    }
    
    // Небольшая пауза чтобы не перегружать API
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Итоги
  console.log('\n' + '='.repeat(60));
  console.log('📊 ИТОГИ РЕГЕНЕРАЦИИ ПРОМОКОДОВ');
  console.log('='.repeat(60));
  console.log(`Всего пользователей: ${users.length}`);
  console.log(`Успешно обработано: ${users.length - totalErrors}`);
  console.log(`С ошибками: ${totalErrors}`);
  console.log(`Всего обновлено промокодов: ${totalUpdated}`);
  console.log('\n📋 Детали по пользователям:');
  
  results.forEach(r => {
    if (r.status === 'ok') {
      console.log(`  ✅ ${r.email}: ${r.updated} промокодов`);
    } else {
      console.log(`  ❌ ${r.email}: ${r.message}`);
    }
  });
}

// Запуск
regenerateAllPromoCodes()
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

