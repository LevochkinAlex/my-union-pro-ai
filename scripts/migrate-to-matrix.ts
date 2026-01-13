#!/usr/bin/env ts-node
/**
 * Matrix Migration Script
 * Мигрирует существующие чаты, сообщения и обращения в Matrix
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN; // Токен администратора для создания пользователей

interface MatrixCredentials {
  userId: string;
  accessToken: string;
}

// Helper: Create Matrix user via admin API
async function createMatrixUser(username: string, displayName: string): Promise<MatrixCredentials | null> {
  if (!ADMIN_TOKEN) {
    console.error('MATRIX_ADMIN_TOKEN not set');
    return null;
  }

  // Генерируем безопасный пароль
  const password = `MU_${username}_${Date.now()}`;
  
  try {
    // Используем admin API для создания пользователя
    const registerUrl = `${MATRIX_SERVER}/_synapse/admin/v2/users/@${username}:matrix.myunion.pro`;
    
    const response = await fetch(registerUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        password,
        displayname: displayName,
        admin: false,
        deactivated: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to create user ${username}:`, error);
      return null;
    }

    // Теперь логинимся чтобы получить access token
    const loginUrl = `${MATRIX_SERVER}/_matrix/client/v3/login`;
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: username,
        },
        password,
      }),
    });

    if (!loginResponse.ok) {
      console.error(`Failed to login as ${username}`);
      return null;
    }

    const loginData = await loginResponse.json();
    return {
      userId: loginData.user_id,
      accessToken: loginData.access_token,
    };
  } catch (err) {
    console.error(`Error creating Matrix user ${username}:`, err);
    return null;
  }
}

// Helper: Create Matrix room
async function createMatrixRoom(
  accessToken: string,
  name: string,
  topic: string,
  isDirect: boolean,
  inviteUserIds: string[] = []
): Promise<string | null> {
  try {
    const url = `${MATRIX_SERVER}/_matrix/client/v3/createRoom`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: isDirect ? undefined : name,
        topic: isDirect ? undefined : topic,
        preset: isDirect ? 'trusted_private_chat' : 'private_chat',
        is_direct: isDirect,
        invite: inviteUserIds,
        creation_content: {
          'm.federate': false, // Не федерируем
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to create room ${name}:`, error);
      return null;
    }

    const data = await response.json();
    return data.room_id;
  } catch (err) {
    console.error(`Error creating room ${name}:`, err);
    return null;
  }
}

// Helper: Send message to Matrix room
async function sendMatrixMessage(
  accessToken: string,
  roomId: string,
  content: string,
  timestamp: Date
): Promise<boolean> {
  try {
    const txnId = `migrate_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const url = `${MATRIX_SERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        msgtype: 'm.text',
        body: content,
        // Добавляем метаданные о миграции
        'org.myunion.migrated': true,
        'org.myunion.original_timestamp': timestamp.toISOString(),
      }),
    });

    return response.ok;
  } catch (err) {
    console.error(`Error sending message to ${roomId}:`, err);
    return false;
  }
}

// Migrate users
async function migrateUsers(): Promise<Map<string, MatrixCredentials>> {
  console.log('\n📧 Migrating users to Matrix...');
  
  const userCredentials = new Map<string, MatrixCredentials>();
  
  // Получаем всех пользователей у которых нет Matrix ID
  const users = await prisma.user.findMany({
    where: {
      matrixUserId: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      email: true,
      phone: true,
    },
  });

  console.log(`Found ${users.length} users without Matrix accounts`);

  for (const user of users) {
    // Генерируем username из email или phone
    const username = user.email 
      ? user.email.replace(/@.*/, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase()
      : user.phone 
        ? `phone_${user.phone.replace(/\D/g, '')}`
        : `user_${user.id.substring(0, 8)}`;
    
    const displayName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') || username;
    
    console.log(`  Creating Matrix user: ${username} (${displayName})`);
    
    const credentials = await createMatrixUser(username, displayName);
    
    if (credentials) {
      // Сохраняем в базу
      await prisma.user.update({
        where: { id: user.id },
        data: {
          matrixUserId: credentials.userId,
          matrixAccessToken: credentials.accessToken,
        },
      });
      
      userCredentials.set(user.id, credentials);
      console.log(`  ✓ Created: ${credentials.userId}`);
    } else {
      console.log(`  ✗ Failed to create user for ${user.id}`);
    }
    
    // Небольшая задержка чтобы не перегружать сервер
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Также загружаем существующих пользователей с Matrix ID
  const existingUsers = await prisma.user.findMany({
    where: {
      matrixUserId: { not: null },
      matrixAccessToken: { not: null },
    },
    select: {
      id: true,
      matrixUserId: true,
      matrixAccessToken: true,
    },
  });

  for (const user of existingUsers) {
    if (user.matrixUserId && user.matrixAccessToken) {
      userCredentials.set(user.id, {
        userId: user.matrixUserId,
        accessToken: user.matrixAccessToken,
      });
    }
  }

  console.log(`✓ Total users with Matrix accounts: ${userCredentials.size}`);
  return userCredentials;
}

// Helper: Get user display name
function getUserDisplayName(user: { firstName?: string | null; lastName?: string | null } | null): string {
  if (!user) return 'Unknown';
  return [user.lastName, user.firstName].filter(Boolean).join(' ') || 'Unknown';
}

// Migrate private chats
async function migratePrivateChats(userCredentials: Map<string, MatrixCredentials>) {
  console.log('\n💬 Migrating private chats...');
  
  const privateChats = await prisma.chat.findMany({
    where: {
      type: 'PRIVATE',
      matrixRoomId: null,
    },
    include: {
      participant1: { select: { id: true, firstName: true, lastName: true } },
      participant2: { select: { id: true, firstName: true, lastName: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true } },
        },
      },
    },
  });

  console.log(`Found ${privateChats.length} private chats to migrate`);

  for (const chat of privateChats) {
    if (!chat.participant1Id || !chat.participant2Id) continue;
    
    const creds1 = userCredentials.get(chat.participant1Id);
    const creds2 = userCredentials.get(chat.participant2Id);
    
    if (!creds1 || !creds2) {
      console.log(`  ✗ Skipping chat ${chat.id}: missing user credentials`);
      continue;
    }

    console.log(`  Creating DM room: ${getUserDisplayName(chat.participant1)} <-> ${getUserDisplayName(chat.participant2)}`);
    
    // Создаем комнату от имени participant1
    const roomId = await createMatrixRoom(
      creds1.accessToken,
      '',
      '',
      true,
      [creds2.userId]
    );

    if (!roomId) {
      console.log(`  ✗ Failed to create room for chat ${chat.id}`);
      continue;
    }

    // Сохраняем roomId
    await prisma.chat.update({
      where: { id: chat.id },
      data: { matrixRoomId: roomId },
    });

    // Мигрируем сообщения
    let migratedMessages = 0;
    for (const message of chat.messages) {
      const senderCreds = userCredentials.get(message.senderId);
      if (!senderCreds) continue;
      
      const success = await sendMatrixMessage(
        senderCreds.accessToken,
        roomId,
        message.content,
        message.createdAt
      );
      
      if (success) migratedMessages++;
      
      // Задержка между сообщениями
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`  ✓ Created room ${roomId}, migrated ${migratedMessages}/${chat.messages.length} messages`);
  }
}

// Migrate group chats
async function migrateGroupChats(userCredentials: Map<string, MatrixCredentials>) {
  console.log('\n👥 Migrating group chats...');
  
  const groupChats = await prisma.chat.findMany({
    where: {
      type: 'GROUP',
      matrixRoomId: null,
    },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      participants: {
        include: {
          user: { select: { id: true } },
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true } },
        },
      },
    },
  });

  console.log(`Found ${groupChats.length} group chats to migrate`);

  for (const chat of groupChats) {
    if (!chat.createdById) {
      console.log(`  ✗ Skipping group ${chat.id}: no creator`);
      continue;
    }
    
    const creatorCreds = userCredentials.get(chat.createdById);
    if (!creatorCreds) {
      console.log(`  ✗ Skipping group ${chat.id}: creator has no Matrix account`);
      continue;
    }

    // Собираем Matrix ID всех участников
    const inviteIds: string[] = [];
    for (const participant of chat.participants) {
      const creds = userCredentials.get(participant.userId);
      if (creds && creds.userId !== creatorCreds.userId) {
        inviteIds.push(creds.userId);
      }
    }

    console.log(`  Creating group room: ${chat.name || 'Без названия'} (${inviteIds.length + 1} members)`);
    
    const roomId = await createMatrixRoom(
      creatorCreds.accessToken,
      chat.name || 'Группа',
      chat.description || '',
      false,
      inviteIds
    );

    if (!roomId) {
      console.log(`  ✗ Failed to create room for group ${chat.id}`);
      continue;
    }

    // Сохраняем roomId
    await prisma.chat.update({
      where: { id: chat.id },
      data: { matrixRoomId: roomId },
    });

    // Мигрируем сообщения
    let migratedMessages = 0;
    for (const message of chat.messages) {
      const senderCreds = userCredentials.get(message.senderId);
      if (!senderCreds) continue;
      
      const success = await sendMatrixMessage(
        senderCreds.accessToken,
        roomId,
        message.content,
        message.createdAt
      );
      
      if (success) migratedMessages++;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`  ✓ Created room ${roomId}, migrated ${migratedMessages}/${chat.messages.length} messages`);
  }
}

// Migrate tickets/appeals
async function migrateTickets(userCredentials: Map<string, MatrixCredentials>) {
  console.log('\n🎫 Migrating tickets/appeals...');
  
  // Получаем бота для ответов на обращения
  const botUser = await prisma.user.findFirst({
    where: { matrixUserId: '@myunion_bot:matrix.myunion.pro' },
  });
  
  const botCreds = botUser 
    ? userCredentials.get(botUser.id)
    : null;
  
  const tickets = await prisma.ticket.findMany({
    where: {
      matrixRoomId: null,
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  console.log(`Found ${tickets.length} tickets to migrate`);

  for (const ticket of tickets) {
    const userCreds = userCredentials.get(ticket.userId);
    if (!userCreds) {
      console.log(`  ✗ Skipping ticket ${ticket.publicId}: user has no Matrix account`);
      continue;
    }

    // Кого приглашаем в комнату обращения (бота + пользователя)
    const inviteIds: string[] = [];
    if (botCreds) {
      inviteIds.push('@myunion_bot:matrix.myunion.pro');
    }

    console.log(`  Creating ticket room: #${ticket.publicId} - ${ticket.title.substring(0, 30)}...`);
    
    const roomId = await createMatrixRoom(
      userCreds.accessToken,
      `Обращение #${ticket.publicId}`,
      ticket.title,
      false,
      inviteIds
    );

    if (!roomId) {
      console.log(`  ✗ Failed to create room for ticket ${ticket.publicId}`);
      continue;
    }

    // Сохраняем roomId
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { matrixRoomId: roomId },
    });

    // Отправляем первое сообщение - содержимое обращения
    await sendMatrixMessage(
      userCreds.accessToken,
      roomId,
      `📋 **${ticket.title}**\n\n${ticket.content}`,
      ticket.createdAt
    );

    // Мигрируем комментарии
    let migratedComments = 0;
    for (const comment of ticket.comments) {
      const commenterCreds = userCredentials.get(comment.userId);
      if (!commenterCreds) continue;
      
      const success = await sendMatrixMessage(
        commenterCreds.accessToken,
        roomId,
        comment.content,
        comment.createdAt
      );
      
      if (success) migratedComments++;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`  ✓ Created room ${roomId}, migrated ${migratedComments}/${ticket.comments.length} comments`);
  }
}

// Main migration function
async function main() {
  console.log('🚀 Starting Matrix migration...');
  console.log(`Matrix server: ${MATRIX_SERVER}`);
  
  if (!ADMIN_TOKEN) {
    console.error('❌ MATRIX_ADMIN_TOKEN environment variable is required');
    console.log('Get admin token: docker exec synapse cat /data/admin_token.txt');
    process.exit(1);
  }

  try {
    // Step 1: Create Matrix accounts for all users
    const userCredentials = await migrateUsers();
    
    // Step 2: Migrate private chats
    await migratePrivateChats(userCredentials);
    
    // Step 3: Migrate group chats
    await migrateGroupChats(userCredentials);
    
    // Step 4: Migrate tickets
    await migrateTickets(userCredentials);
    
    console.log('\n✅ Migration completed!');
    
    // Summary
    const stats = await prisma.$transaction([
      prisma.user.count({ where: { matrixUserId: { not: null } } }),
      prisma.chat.count({ where: { matrixRoomId: { not: null } } }),
      prisma.ticket.count({ where: { matrixRoomId: { not: null } } }),
    ]);
    
    console.log('\n📊 Migration summary:');
    console.log(`  Users with Matrix accounts: ${stats[0]}`);
    console.log(`  Chats migrated: ${stats[1]}`);
    console.log(`  Tickets migrated: ${stats[2]}`);
    
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
