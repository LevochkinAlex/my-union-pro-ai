#!/usr/bin/env node

/**
 * Скрипт для вызова API reset-and-sync-bb
 * Используется для сброса пароля и синхронизации с BestBenefits
 */

const email = process.argv[2];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   node scripts/call-reset-sync-api.mjs cursedx@ya.ru');
  process.exit(1);
}

// Вызываем API через fetch
fetch('http://localhost:3000/api/admin/reset-and-sync-bb', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Для внутреннего вызова можно использовать специальный заголовок
    'X-Internal-Request': 'true',
  },
  body: JSON.stringify({ email }),
})
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      console.error('❌ Ошибка:', data.error);
      process.exit(1);
    }
    console.log('\n✅ Успешно!');
    console.log('📧 Email:', data.email);
    console.log('🔑 Новый пароль:', data.newPassword);
    if (data.bestBenefits?.userId) {
      console.log('🆔 BestBenefits User ID:', data.bestBenefits.userId);
      console.log('📊 Status:', data.bestBenefits.status);
    } else if (data.bestBenefits?.error) {
      console.log('⚠️  BestBenefits sync error:', data.bestBenefits.error);
    }
    console.log('\n⚠️  ВАЖНО: Сохраните пароль!');
  })
  .catch(error => {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  });

