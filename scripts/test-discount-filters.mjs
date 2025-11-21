import 'dotenv/config';

async function testDiscountFilters() {
  console.log('🧪 Testing discount filters...\n');

  const baseUrl = 'http://localhost:3004';

  // Test 1: Fetch all discounts
  console.log('📦 Test 1: Fetching all discounts');
  try {
    const response = await fetch(`${baseUrl}/api/discounts`, {
      headers: {
        Cookie: 'next-auth.session-token=test', // You'll need a real session token
      },
    });
    
    if (!response.ok) {
      console.log('❌ Need to be logged in to test. Status:', response.status);
      console.log('Please test manually in browser after logging in.\n');
      return;
    }

    const data = await response.json();
    console.log(`✅ Total discounts: ${data.meta?.total || data.discounts.length}`);
    console.log(`📊 Available cities: ${data.cities?.length || 0}`);
    if (data.cities && data.cities.length > 0) {
      console.log(`   Cities:`, data.cities.map(c => `${c.name} (${c.id})`).join(', '));
    }
    console.log(`📁 Available categories: ${data.categories?.length || 0}`);
    if (data.categories && data.categories.length > 0) {
      console.log(`   Categories:`, data.categories.map(c => `${c.name} (${c.id})`).join(', '));
    }

    // Test 2: Filter by city (if cities exist)
    if (data.cities && data.cities.length > 0) {
      const testCity = data.cities[0];
      console.log(`\n📍 Test 2: Filtering by city "${testCity.name}" (ID: ${testCity.id})`);
      
      const cityResponse = await fetch(`${baseUrl}/api/discounts?cityId=${testCity.id}`, {
        headers: {
          Cookie: 'next-auth.session-token=test',
        },
      });
      
      const cityData = await cityResponse.json();
      console.log(`✅ Discounts in ${testCity.name}: ${cityData.discounts.length}`);
      
      if (cityData.discounts.length > 0) {
        const sample = cityData.discounts[0];
        console.log(`   Sample: ${sample.title}`);
        console.log(`   Cities: ${sample.cities?.map(c => c.name).join(', ')}`);
      }
    }

    // Test 3: Filter by category (if categories exist)
    if (data.categories && data.categories.length > 0) {
      const testCategory = data.categories[0];
      console.log(`\n🏷️  Test 3: Filtering by category "${testCategory.name}" (ID: ${testCategory.id})`);
      
      const catResponse = await fetch(`${baseUrl}/api/discounts?categoryIds=${testCategory.id}`, {
        headers: {
          Cookie: 'next-auth.session-token=test',
        },
      });
      
      const catData = await catResponse.json();
      console.log(`✅ Discounts in ${testCategory.name}: ${catData.discounts.length}`);
      
      if (catData.discounts.length > 0) {
        const sample = catData.discounts[0];
        console.log(`   Sample: ${sample.title}`);
        console.log(`   Category: ${sample.mainCategory?.name}`);
      }
    }

    // Test 4: Search
    console.log(`\n🔍 Test 4: Search for "ресторан"`);
    const searchResponse = await fetch(`${baseUrl}/api/discounts?search=ресторан`, {
      headers: {
        Cookie: 'next-auth.session-token=test',
      },
    });
    
    const searchData = await searchResponse.json();
    console.log(`✅ Search results: ${searchData.discounts.length}`);
    if (searchData.discounts.length > 0) {
      console.log(`   Results:`, searchData.discounts.slice(0, 3).map(d => d.title).join(', '));
    }

    // Test 5: Premium only
    console.log(`\n⭐ Test 5: Premium discounts only`);
    const premiumResponse = await fetch(`${baseUrl}/api/discounts?premiumOnly=1`, {
      headers: {
        Cookie: 'next-auth.session-token=test',
      },
    });
    
    const premiumData = await premiumResponse.json();
    console.log(`✅ Premium discounts: ${premiumData.discounts.length}`);
    if (premiumData.discounts.length > 0) {
      console.log(`   All premium?`, premiumData.discounts.every(d => d.isPremium));
    }

    console.log('\n✅ All filter tests completed!');
    console.log('\n💡 To test manually:');
    console.log('   1. Open http://localhost:3004/dashboard/discounts');
    console.log('   2. Try selecting different cities');
    console.log('   3. Try clicking on category tags');
    console.log('   4. Try the search box');
    console.log('   5. Try the Premium toggle');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDiscountFilters();

