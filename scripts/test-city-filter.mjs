import 'dotenv/config';

/**
 * Тест фильтрации по городам
 * Проверяет:
 * 1. Получение списка городов
 * 2. Фильтрацию скидок по конкретному городу
 * 3. Корректность результатов
 */

async function testCityFilter() {
  console.log('🧪 Тестирование фильтрации по городам\n');

  const baseUrl = 'http://localhost:3004';
  const USE_REAL_API = process.env.USE_REAL_BB_API;
  
  console.log(`📌 USE_REAL_BB_API: ${USE_REAL_API}`);
  console.log(`📌 API URL: ${process.env.BEST_BENEFITS_API_URL}\n`);

  try {
    // Step 1: Get all discounts and cities
    console.log('📦 Шаг 1: Получение всех скидок и городов...');
    const allResponse = await fetch(`${baseUrl}/api/discounts?limit=100`);
    
    if (!allResponse.ok) {
      console.log('❌ Требуется авторизация. Откройте браузер и войдите в систему.');
      console.log('   Затем запустите тест снова.\n');
      return;
    }

    const allData = await allResponse.json();
    console.log(`✅ Получено ${allData.discounts.length} скидок`);
    console.log(`✅ Доступно ${allData.cities.length} городов`);
    console.log(`📊 Источник данных: ${allData.source || 'unknown'}\n`);

    if (allData.cities.length === 0) {
      console.log('⚠️  Города не найдены!');
      return;
    }

    // Show all cities
    console.log('🏙️  Список городов (первые 10):');
    allData.cities.slice(0, 10).forEach((city, idx) => {
      console.log(`   ${idx + 1}. ${city.name} (ID: ${city.id})`);
    });
    console.log('');

    // Step 2: Test filter for each city
    console.log('🔍 Шаг 2: Тестирование фильтрации...\n');

    for (let i = 0; i < Math.min(3, allData.cities.length); i++) {
      const testCity = allData.cities[i];
      console.log(`📍 Тест города: ${testCity.name} (ID: ${testCity.id})`);

      // Count discounts that should match
      const expectedCount = allData.discounts.filter(d => 
        d.cities.some(c => c.id === testCity.id)
      ).length;
      console.log(`   Ожидается скидок: ${expectedCount}`);

      // Fetch filtered results
      const filterResponse = await fetch(`${baseUrl}/api/discounts?cityId=${testCity.id}`);
      const filterData = await filterResponse.json();
      
      console.log(`   Получено скидок: ${filterData.discounts.length}`);

      // Verify all results have the correct city
      const allHaveCity = filterData.discounts.every(d => 
        d.cities.some(c => c.id === testCity.id)
      );

      if (allHaveCity && filterData.discounts.length > 0) {
        console.log(`   ✅ Фильтр работает корректно`);
      } else if (filterData.discounts.length === 0) {
        console.log(`   ⚠️  Нет скидок для этого города`);
      } else {
        console.log(`   ❌ ОШИБКА: Некоторые скидки не содержат этот город!`);
        filterData.discounts.forEach((d, idx) => {
          const hasCi ty = d.cities.some(c => c.id === testCity.id);
          if (!hasCity) {
            console.log(`      - ${idx + 1}. "${d.title}" имеет города: ${d.cities.map(c => c.name).join(', ')}`);
          }
        });
      }
      console.log('');
    }

    // Step 3: Test sorting
    console.log('📋 Шаг 3: Проверка сортировки городов...');
    const sorted = [...allData.cities];
    const isSorted = sorted.every((city, idx, arr) => {
      if (idx === 0) return true;
      return arr[idx - 1].name.localeCompare(city.name, 'ru-RU') <= 0;
    });

    if (isSorted) {
      console.log('✅ Города отсортированы по алфавиту');
    } else {
      console.log('❌ Города НЕ отсортированы!');
      console.log('   Первые 5 городов:');
      allData.cities.slice(0, 5).forEach((city, idx) => {
        console.log(`   ${idx + 1}. ${city.name}`);
      });
    }

    console.log('\n✅ Тестирование завершено!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
  }
}

testCityFilter();

