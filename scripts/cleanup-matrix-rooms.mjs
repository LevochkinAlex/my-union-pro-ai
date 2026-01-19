import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;

async function fetchAllRooms() {
  const rooms = [];
  let from = undefined;

  while (true) {
    const url = new URL(`${MATRIX_SERVER_URL}/_synapse/admin/v1/rooms`);
    url.searchParams.set('limit', '100');
    if (from) url.searchParams.set('from', from);

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${MATRIX_ADMIN_TOKEN}`,
      },
    });

    if (!resp.ok) {
      throw new Error(`Failed to list rooms: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    const batch = data.rooms || [];
    rooms.push(...batch);

    if (!data.next_batch) break;
    from = data.next_batch;
  }

  return rooms;
}

async function getAiRoomIds() {
  const aiChats = await prisma.chat.findMany({
    where: {
      matrixRoomId: { not: null },
      participants: {
        some: {
          user: {
            OR: [
              { matrixUserId: { contains: 'ai_assistant' } },
              { matrixUserId: { contains: 'myunion_bot' } },
              { matrixUserId: { contains: 'assistant' } },
            ],
          },
        },
      },
    },
    select: { matrixRoomId: true, name: true },
  });

  const ids = aiChats
    .map(c => c.matrixRoomId)
    .filter((id) => typeof id === 'string' && id.length > 0);

  return { ids, aiChats };
}

async function deleteRoom(roomId, reason) {
  const resp = await fetch(`${MATRIX_SERVER_URL}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MATRIX_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({
      block: true,
      purge: true,
      force_purge: true,
      reason,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to delete room ${roomId}: ${resp.status} ${await resp.text()}`);
  }
}

async function cleanupMatrixRooms() {
  if (!MATRIX_ADMIN_TOKEN) {
    throw new Error('MATRIX_ADMIN_TOKEN is not set');
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');

  if (!confirm) {
    console.log('⚠️  ВНИМАНИЕ! Этот скрипт удалит ВСЕ Matrix комнаты, кроме чатов с ИИ.');
    console.log('Для подтверждения запустите:');
    console.log('  node scripts/cleanup-matrix-rooms.mjs --confirm');
    console.log('Для проверки без удаления:');
    console.log('  node scripts/cleanup-matrix-rooms.mjs --dry-run');
    process.exit(1);
  }

  console.log('🚀 Начинаем очистку Matrix комнат...');

  const { ids: aiRoomIds, aiChats } = await getAiRoomIds();
  console.log(`✅ AI комнаты для сохранения: ${aiRoomIds.length}`);
  aiChats.forEach(c => console.log(`  - ${c.name || c.matrixRoomId}`));

  const rooms = await fetchAllRooms();
  console.log(`📦 Всего Matrix комнат: ${rooms.length}`);

  const roomsToDelete = rooms.filter(r => !aiRoomIds.includes(r.room_id));
  console.log(`🧹 К удалению: ${roomsToDelete.length}`);

  if (dryRun) {
    console.log('DRY RUN: комнаты не удаляются');
    return;
  }

  let deleted = 0;
  for (const room of roomsToDelete) {
    const roomId = room.room_id;
    try {
      await deleteRoom(roomId, 'Full cleanup requested');
      deleted++;
      console.log(`✅ Удалена комната: ${roomId}`);
    } catch (err) {
      console.error(`❌ Ошибка удаления комнаты ${roomId}:`, err?.message || err);
    }
  }

  console.log(`
✅ Готово. Удалено комнат: ${deleted}`);
}

cleanupMatrixRooms()
  .catch(err => {
    console.error('❌ Ошибка:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
