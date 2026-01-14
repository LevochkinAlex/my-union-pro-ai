/**
 * Reset AI chats for all users
 * Creates fresh Matrix rooms with the AI bot
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MATRIX_HOMESERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;
const BOT_USER_ID = '@myunion_bot:matrix.myunion.pro';

async function matrixFetch(endpoint: string, options: RequestInit = {}, token?: string): Promise<any> {
  const url = `${MATRIX_HOMESERVER}/_matrix/client/v3${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || MATRIX_ADMIN_TOKEN}`,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Matrix API error: ${response.status} ${text}`);
  }
  
  return response.json();
}

async function createRoomWithBot(userId: string, userMatrixId: string, userToken: string, userName: string): Promise<string | null> {
  try {
    // Create a new DM room
    const room = await matrixFetch('/createRoom', {
      method: 'POST',
      body: JSON.stringify({
        preset: 'trusted_private_chat',
        is_direct: true,
        invite: [BOT_USER_ID],
        name: undefined, // DM rooms don't need names
        initial_state: [
          {
            type: 'm.room.guest_access',
            state_key: '',
            content: { guest_access: 'forbidden' }
          }
        ]
      }),
    }, userToken);

    console.log(`  ✓ Created room ${room.room_id} for ${userName}`);
    return room.room_id;
  } catch (error) {
    console.error(`  ✗ Failed to create room for ${userName}:`, error);
    return null;
  }
}

async function main() {
  console.log('🔄 Resetting AI chats for all users...\n');

  // Get all users with Matrix credentials
  const users = await prisma.user.findMany({
    where: {
      matrixUserId: { not: null },
      matrixAccessToken: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      matrixUserId: true,
      matrixAccessToken: true,
    }
  });

  console.log(`Found ${users.length} users with Matrix accounts\n`);

  let success = 0;
  let failed = 0;

  for (const user of users) {
    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User';
    console.log(`Processing: ${userName} (${user.matrixUserId})`);

    // Check if user already has AI chat
    const existingChat = await prisma.chat.findFirst({
      where: {
        type: 'PRIVATE',
        participants: {
          some: { userId: user.id }
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: { matrixUserId: true }
            }
          }
        }
      }
    });

    // Check if it's an AI chat (participant is bot)
    const isAIChat = existingChat?.participants.some(
      p => p.user?.matrixUserId?.includes('myunion_bot') || p.user?.matrixUserId?.includes('ai_assistant')
    );

    if (existingChat) {
      console.log(`  → Existing chat found (AI: ${isAIChat}), will update matrixRoomId`);
    }

    // Create new Matrix room with bot
    const newRoomId = await createRoomWithBot(
      user.id,
      user.matrixUserId!,
      user.matrixAccessToken!,
      userName
    );

    if (newRoomId) {
      // Get or create AI bot user in our DB
      let botUser = await prisma.user.findFirst({
        where: { matrixUserId: BOT_USER_ID }
      });

      if (!botUser) {
        botUser = await prisma.user.create({
          data: {
            email: 'bot@myunion.pro',
            firstName: 'МойСоюз',
            lastName: 'Помощник',
            matrixUserId: BOT_USER_ID,
          }
        });
        console.log(`  → Created bot user in DB`);
      }

      if (existingChat) {
        // Update existing chat with new room
        await prisma.chat.update({
          where: { id: existingChat.id },
          data: { matrixRoomId: newRoomId }
        });
        console.log(`  ✓ Updated AI chat: ${existingChat.id}\n`);
      } else {
        // Create new chat record
        const newChat = await prisma.chat.create({
          data: {
            type: 'PRIVATE',
            matrixRoomId: newRoomId,
            participants: {
              create: [
                { userId: user.id, role: 'member' },
                { userId: botUser.id, role: 'admin' },
              ]
            }
          }
        });
        console.log(`  ✓ Created new AI chat: ${newChat.id}\n`);
      }
      success++;
    } else {
      failed++;
      console.log('');
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  ✓ Success: ${success}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  Total: ${users.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
