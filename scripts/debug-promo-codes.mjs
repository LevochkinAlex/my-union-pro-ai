import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugPromoCodes() {
  const email = process.argv[2] || 'talik.e@mail.ru';
  
  console.log(`\n🔍 Debugging promo codes for: ${email}\n`);
  
  // Find user
  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      bestBenefitsUserId: true,
    },
  });
  
  if (!user) {
    console.error(`❌ User not found: ${email}`);
    process.exit(1);
  }
  
  console.log(`✅ User found:`, user);
  
  // Get preferences
  const prefs = await prisma.discountPreference.findUnique({
    where: { userId: user.id },
  });
  
  if (!prefs) {
    console.log(`❌ No preferences found for user`);
    process.exit(1);
  }
  
  const filters = prefs.filters || {};
  const claimed = filters.claimed || [];
  const favorites = filters.favorites || [];
  
  console.log(`\n📋 Preferences:`);
  console.log(`  - Claimed (${claimed.length}):`);
  claimed.forEach((item, i) => {
    if (typeof item === 'object') {
      console.log(`    ${i + 1}. ID: ${item.id}, PromoCode: "${item.promoCode || 'null'}"`);
    } else {
      console.log(`    ${i + 1}. ID: ${item} (OLD FORMAT - NO PROMO CODE!)`);
    }
  });
  
  console.log(`  - Favorites (${favorites.length}): ${favorites.join(', ')}`);
  
  // Check if any items are in old format
  const oldFormatCount = claimed.filter(item => typeof item === 'number').length;
  if (oldFormatCount > 0) {
    console.log(`\n⚠️ WARNING: ${oldFormatCount} items in OLD FORMAT (numbers)!`);
    console.log(`   These items have NO promo codes stored.`);
    console.log(`   User needs to sync with BestBenefits to get promo codes.`);
  }
  
  // Check for items with promo codes
  const withPromoCodes = claimed.filter(item => typeof item === 'object' && item.promoCode);
  console.log(`\n✅ Items with promo codes: ${withPromoCodes.length}`);
  withPromoCodes.forEach(item => {
    console.log(`   - ID: ${item.id}, PromoCode: "${item.promoCode}"`);
  });
  
  await prisma.$disconnect();
}

debugPromoCodes().catch(console.error);
