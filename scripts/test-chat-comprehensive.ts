/**
 * Комплексный тест всех функций чата
 * Тестирует: создание чатов, сообщения, файлы, участники, папки, архивация, удаление
 * 
 * Запуск: npx tsx scripts/test-chat-comprehensive.ts
 */

import { prisma } from "../lib/prisma";
import { randomUUID } from "crypto";

// ============================================================================
// КОНФИГУРАЦИЯ
// ============================================================================

const TEST_PREFIX = "TEST_CHAT_COMPREHENSIVE_";
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// ============================================================================
// УТИЛИТЫ ЛОГИРОВАНИЯ
// ============================================================================

function log(message: string) {
  console.log(message);
}

function logSection(title: string) {
  console.log(`\n${COLORS.cyan}${"═".repeat(70)}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${"═".repeat(70)}${COLORS.reset}\n`);
}

function logSubSection(title: string) {
  console.log(`\n${COLORS.yellow}── ${title} ──${COLORS.reset}\n`);
}

function logSuccess(message: string) {
  console.log(`${COLORS.green}✓ ${message}${COLORS.reset}`);
}

function logError(message: string) {
  console.log(`${COLORS.red}✗ ${message}${COLORS.reset}`);
}

function logInfo(message: string) {
  console.log(`${COLORS.blue}ℹ ${message}${COLORS.reset}`);
}

function logWarning(message: string) {
  console.log(`${COLORS.yellow}⚠ ${message}${COLORS.reset}`);
}

// ============================================================================
// РЕЗУЛЬТАТЫ ТЕСТОВ
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const testResults: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<boolean> {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    testResults.push({ name, passed: true, duration });
    logSuccess(`${name} (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);
    testResults.push({ name, passed: false, error: errorMessage, duration });
    logError(`${name}: ${errorMessage}`);
    return false;
  }
}

// ============================================================================
// ТЕСТОВЫЕ ДАННЫЕ
// ============================================================================

interface TestData {
  user1?: { id: string; email: string };
  user2?: { id: string; email: string };
  user3?: { id: string; email: string };
  organization?: { id: string; name: string };
  privateChat?: { id: string };
  groupChat?: { id: string };
  channelChat?: { id: string };
  meetingChat?: { id: string };
  folder?: { id: string };
  message?: { id: string };
  attachment?: { id: string };
}

const testData: TestData = {};

// ============================================================================
// ОЧИСТКА ТЕСТОВЫХ ДАННЫХ
// ============================================================================

async function cleanupTestData() {
  logSubSection("Очистка предыдущих тестовых данных");
  
  // Удаляем тестовые папки
  const testFolders = await prisma.chatFolder.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
  if (testFolders.length > 0) {
    await prisma.chatFolderChat.deleteMany({
      where: { folderId: { in: testFolders.map(f => f.id) } },
    });
    await prisma.chatFolder.deleteMany({
      where: { id: { in: testFolders.map(f => f.id) } },
    });
    logInfo(`Удалено ${testFolders.length} тестовых папок`);
  }

  // Удаляем тестовые чаты
  const testChats = await prisma.chat.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
  
  if (testChats.length > 0) {
    const chatIds = testChats.map(c => c.id);
    
    // Удаляем связанные данные
    await prisma.chatMessageReaction.deleteMany({
      where: { message: { chatId: { in: chatIds } } },
    });
    await prisma.chatMessageRead.deleteMany({
      where: { message: { chatId: { in: chatIds } } },
    });
    await prisma.chatMessageAttachment.deleteMany({
      where: { message: { chatId: { in: chatIds } } },
    });
    await prisma.chatMessage.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.chatParticipant.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.chat.deleteMany({ where: { id: { in: chatIds } } });
    logInfo(`Удалено ${testChats.length} тестовых чатов`);
  }

  // Удаляем тестовых пользователей
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_PREFIX.toLowerCase() } },
  });
  
  if (testUsers.length > 0) {
    const userIds = testUsers.map(u => u.id);
    
    // Удаляем связанные данные пользователей
    await prisma.chatParticipant.deleteMany({ where: { userId: { in: userIds } } });
    
    // Удаляем сообщения пользователей
    const userMessages = await prisma.chatMessage.findMany({
      where: { senderId: { in: userIds } },
      select: { id: true },
    });
    if (userMessages.length > 0) {
      const msgIds = userMessages.map(m => m.id);
      await prisma.chatMessageReaction.deleteMany({ where: { messageId: { in: msgIds } } });
      await prisma.chatMessageRead.deleteMany({ where: { messageId: { in: msgIds } } });
      await prisma.chatMessageAttachment.deleteMany({ where: { messageId: { in: msgIds } } });
      await prisma.chatMessage.deleteMany({ where: { senderId: { in: userIds } } });
    }
    
    // Удаляем папки пользователей
    const userFolders = await prisma.chatFolder.findMany({
      where: { createdById: { in: userIds } },
    });
    if (userFolders.length > 0) {
      await prisma.chatFolderChat.deleteMany({ where: { folderId: { in: userFolders.map(f => f.id) } } });
      await prisma.chatFolder.deleteMany({ where: { createdById: { in: userIds } } });
    }
    
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    logInfo(`Удалено ${testUsers.length} тестовых пользователей`);
  }

  logSuccess("Очистка завершена");
}

// ============================================================================
// СОЗДАНИЕ ТЕСТОВЫХ ПОЛЬЗОВАТЕЛЕЙ
// ============================================================================

async function createTestUsers() {
  logSubSection("Создание тестовых пользователей");

  // Пользователь 1 (создатель/админ)
  testData.user1 = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${TEST_PREFIX.toLowerCase()}user1@example.com`,
      firstName: "Тест",
      lastName: "Пользователь1",
      role: "MEMBER",
      membershipStatus: "APPROVED",
    },
    select: { id: true, email: true },
  });
  logSuccess(`Создан пользователь 1: ${testData.user1.email}`);

  // Пользователь 2 (участник)
  testData.user2 = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${TEST_PREFIX.toLowerCase()}user2@example.com`,
      firstName: "Тест",
      lastName: "Пользователь2",
      role: "MEMBER",
      membershipStatus: "APPROVED",
    },
    select: { id: true, email: true },
  });
  logSuccess(`Создан пользователь 2: ${testData.user2.email}`);

  // Пользователь 3 (дополнительный участник)
  testData.user3 = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${TEST_PREFIX.toLowerCase()}user3@example.com`,
      firstName: "Тест",
      lastName: "Пользователь3",
      role: "MEMBER",
      membershipStatus: "APPROVED",
    },
    select: { id: true, email: true },
  });
  logSuccess(`Создан пользователь 3: ${testData.user3.email}`);
}

// ============================================================================
// ТЕСТЫ СОЗДАНИЯ ЧАТОВ
// ============================================================================

async function testChatCreation() {
  logSection("1. ТЕСТЫ СОЗДАНИЯ ЧАТОВ");

  // 1.1 Создание приватного чата
  await runTest("1.1 Создание приватного чата между двумя пользователями", async () => {
    const chat = await prisma.chat.create({
      data: {
        id: randomUUID(),
        type: "PRIVATE",
        name: `${TEST_PREFIX}PRIVATE_CHAT`,
        createdById: testData.user1!.id,
        participants: {
          create: [
            { userId: testData.user1!.id, role: "admin" },
            { userId: testData.user2!.id, role: "member" },
          ],
        },
      },
    });
    testData.privateChat = { id: chat.id };
    
    const participantCount = await prisma.chatParticipant.count({
      where: { chatId: chat.id },
    });
    if (participantCount !== 2) {
      throw new Error(`Ожидалось 2 участника, получено ${participantCount}`);
    }
  });

  // 1.2 Создание группового чата
  await runTest("1.2 Создание группового чата", async () => {
    const chat = await prisma.chat.create({
      data: {
        id: randomUUID(),
        type: "GROUP",
        name: `${TEST_PREFIX}GROUP_CHAT`,
        description: "Тестовый групповой чат",
        createdById: testData.user1!.id,
        participants: {
          create: [
            { userId: testData.user1!.id, role: "admin" },
            { userId: testData.user2!.id, role: "member" },
            { userId: testData.user3!.id, role: "member" },
          ],
        },
      },
    });
    testData.groupChat = { id: chat.id };
    
    const participantCount = await prisma.chatParticipant.count({
      where: { chatId: chat.id },
    });
    if (participantCount !== 3) {
      throw new Error(`Ожидалось 3 участника, получено ${participantCount}`);
    }
  });

  // 1.3 Создание канала
  await runTest("1.3 Создание канала (CHANNEL)", async () => {
    const chat = await prisma.chat.create({
      data: {
        id: randomUUID(),
        type: "CHANNEL",
        name: `${TEST_PREFIX}CHANNEL`,
        description: "Тестовый канал",
        createdById: testData.user1!.id,
        participants: {
          create: [
            { userId: testData.user1!.id, role: "admin" },
          ],
        },
      },
    });
    testData.channelChat = { id: chat.id };
  });

  // 1.4 Создание чата заседания (GROUP с meetingId - симуляция)
  await runTest("1.4 Создание группового чата (симуляция чата заседания)", async () => {
    // В реальности meetingId привязывается при создании заседания
    // Здесь создаем обычный GROUP чат как симуляцию
    const chat = await prisma.chat.create({
      data: {
        id: randomUUID(),
        type: "GROUP",
        name: `${TEST_PREFIX}MEETING_CHAT`,
        description: "Чат заседания (симуляция)",
        createdById: testData.user1!.id,
        // meetingId: null - в реальности привязка идет от Meeting
        participants: {
          create: [
            { userId: testData.user1!.id, role: "admin" },
            { userId: testData.user2!.id, role: "member" },
          ],
        },
      },
    });
    testData.meetingChat = { id: chat.id };
  });

  // 1.5 Проверка типов чатов
  await runTest("1.5 Проверка что все типы чатов созданы корректно", async () => {
    const privateChat = await prisma.chat.findUnique({ where: { id: testData.privateChat!.id } });
    const groupChat = await prisma.chat.findUnique({ where: { id: testData.groupChat!.id } });
    const channelChat = await prisma.chat.findUnique({ where: { id: testData.channelChat!.id } });
    
    if (privateChat?.type !== "PRIVATE") throw new Error("Тип приватного чата неверный");
    if (groupChat?.type !== "GROUP") throw new Error("Тип группового чата неверный");
    if (channelChat?.type !== "CHANNEL") throw new Error("Тип канала неверный");
  });
}

// ============================================================================
// ТЕСТЫ СООБЩЕНИЙ
// ============================================================================

async function testMessages() {
  logSection("2. ТЕСТЫ СООБЩЕНИЙ");

  // 2.1 Отправка текстового сообщения
  await runTest("2.1 Отправка текстового сообщения", async () => {
    const message = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        chatId: testData.groupChat!.id,
        senderId: testData.user1!.id,
        content: "Привет! Это тестовое сообщение.",
        messageType: "text",
      },
    });
    testData.message = { id: message.id };
    
    // Обновляем lastMessageAt в чате
    await prisma.chat.update({
      where: { id: testData.groupChat!.id },
      data: { 
        lastMessageAt: new Date(),
        lastMessageId: message.id,
      },
    });
  });

  // 2.2 Отправка сообщения с вложением
  await runTest("2.2 Отправка сообщения с вложением (файл)", async () => {
    const message = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        chatId: testData.groupChat!.id,
        senderId: testData.user2!.id,
        content: "Файл прикреплен",
        messageType: "file",
        attachments: {
          create: {
            id: randomUUID(),
            name: "test_document.pdf",
            url: "/uploads/chat/test_document.pdf",
            type: "file",
            mimeType: "application/pdf",
            size: 12345,
          },
        },
      },
      include: { attachments: true },
    });
    
    if (message.attachments.length !== 1) {
      throw new Error(`Ожидалось 1 вложение, получено ${message.attachments.length}`);
    }
    testData.attachment = { id: message.attachments[0].id };
  });

  // 2.3 Ответ на сообщение (reply)
  await runTest("2.3 Ответ на сообщение (reply)", async () => {
    const reply = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        chatId: testData.groupChat!.id,
        senderId: testData.user2!.id,
        content: "Это ответ на предыдущее сообщение",
        messageType: "text",
        replyToId: testData.message!.id,
      },
    });
    
    if (reply.replyToId !== testData.message!.id) {
      throw new Error("replyToId не установлен корректно");
    }
  });

  // 2.4 Создание треда (thread)
  await runTest("2.4 Создание треда (thread)", async () => {
    // Сообщение в треде
    const threadReply = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        chatId: testData.groupChat!.id,
        senderId: testData.user3!.id,
        content: "Это сообщение в треде",
        messageType: "text",
        threadRootId: testData.message!.id,
      },
    });

    // Обновляем счетчик ответов
    await prisma.chatMessage.update({
      where: { id: testData.message!.id },
      data: { 
        threadRepliesCount: { increment: 1 },
        threadLastReplyAt: new Date(),
      },
    });
    
    const rootMessage = await prisma.chatMessage.findUnique({
      where: { id: testData.message!.id },
    });
    
    if (rootMessage?.threadRepliesCount !== 1) {
      throw new Error(`Ожидалось threadRepliesCount=1, получено ${rootMessage?.threadRepliesCount}`);
    }
  });

  // 2.5 Редактирование сообщения
  await runTest("2.5 Редактирование сообщения", async () => {
    const updated = await prisma.chatMessage.update({
      where: { id: testData.message!.id },
      data: {
        content: "Привет! Это ОТРЕДАКТИРОВАННОЕ тестовое сообщение.",
        editedAt: new Date(),
      },
    });
    
    if (!updated.editedAt) {
      throw new Error("editedAt не установлен после редактирования");
    }
  });

  // 2.6 Добавление реакции
  await runTest("2.6 Добавление реакции на сообщение", async () => {
    const reaction = await prisma.chatMessageReaction.create({
      data: {
        id: randomUUID(),
        messageId: testData.message!.id,
        userId: testData.user2!.id,
        emoji: "👍",
      },
    });
    
    const reactions = await prisma.chatMessageReaction.findMany({
      where: { messageId: testData.message!.id },
    });
    
    if (reactions.length !== 1) {
      throw new Error(`Ожидалось 1 реакция, получено ${reactions.length}`);
    }
  });

  // 2.7 Пометка сообщений как прочитанных
  await runTest("2.7 Пометка сообщений как прочитанных", async () => {
    // Обновляем readAt участника
    await prisma.chatParticipant.updateMany({
      where: {
        chatId: testData.groupChat!.id,
        userId: testData.user2!.id,
      },
      data: {
        readAt: new Date(),
      },
    });
    
    // Создаем запись о прочтении конкретного сообщения
    await prisma.chatMessageRead.create({
      data: {
        id: randomUUID(),
        messageId: testData.message!.id,
        userId: testData.user2!.id,
      },
    });
  });

  // 2.8 Удаление сообщения
  await runTest("2.8 Удаление сообщения", async () => {
    // Создаем сообщение для удаления
    const messageToDelete = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        chatId: testData.groupChat!.id,
        senderId: testData.user1!.id,
        content: "Это сообщение будет удалено",
        messageType: "text",
      },
    });
    
    // Удаляем сообщение
    await prisma.chatMessage.delete({
      where: { id: messageToDelete.id },
    });
    
    // Проверяем что удалено
    const deleted = await prisma.chatMessage.findUnique({
      where: { id: messageToDelete.id },
    });
    
    if (deleted) {
      throw new Error("Сообщение не было удалено");
    }
  });

  // 2.9 Отправка изображения
  await runTest("2.9 Отправка сообщения с изображением", async () => {
    const message = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        chatId: testData.groupChat!.id,
        senderId: testData.user1!.id,
        content: "",
        messageType: "image",
        attachments: {
          create: {
            id: randomUUID(),
            name: "photo.jpg",
            url: "/uploads/chat/photo.jpg",
            type: "image",
            mimeType: "image/jpeg",
            size: 54321,
          },
        },
      },
    });
    
    if (message.messageType !== "image") {
      throw new Error("Тип сообщения должен быть image");
    }
  });
}

// ============================================================================
// ТЕСТЫ УЧАСТНИКОВ
// ============================================================================

async function testParticipants() {
  logSection("3. ТЕСТЫ УЧАСТНИКОВ");

  // 3.1 Добавление участника в чат
  await runTest("3.1 Добавление участника в групповой чат", async () => {
    // Создаем нового пользователя для добавления
    const newUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `${TEST_PREFIX.toLowerCase()}newuser@example.com`,
        firstName: "Новый",
        lastName: "Участник",
        role: "MEMBER",
        membershipStatus: "APPROVED",
      },
    });

    await prisma.chatParticipant.create({
      data: {
        chatId: testData.groupChat!.id,
        userId: newUser.id,
        role: "member",
      },
    });

    const count = await prisma.chatParticipant.count({
      where: { chatId: testData.groupChat!.id },
    });
    
    if (count !== 4) {
      throw new Error(`Ожидалось 4 участника, получено ${count}`);
    }
  });

  // 3.2 Изменение роли участника
  await runTest("3.2 Изменение роли участника (member -> admin)", async () => {
    await prisma.chatParticipant.updateMany({
      where: {
        chatId: testData.groupChat!.id,
        userId: testData.user2!.id,
      },
      data: { role: "admin" },
    });

    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatId: testData.groupChat!.id,
        userId: testData.user2!.id,
      },
    });

    if (participant?.role !== "admin") {
      throw new Error("Роль не изменилась");
    }
  });

  // 3.3 Удаление участника из чата
  await runTest("3.3 Удаление участника из чата", async () => {
    await prisma.chatParticipant.deleteMany({
      where: {
        chatId: testData.groupChat!.id,
        userId: testData.user3!.id,
      },
    });

    const count = await prisma.chatParticipant.count({
      where: { chatId: testData.groupChat!.id },
    });
    
    if (count !== 3) {
      throw new Error(`Ожидалось 3 участника после удаления, получено ${count}`);
    }
  });

  // 3.4 Выход из чата (leave) - помечаем leftAt
  await runTest("3.4 Выход пользователя из чата (leave с leftAt)", async () => {
    // Пользователь "выходит" из приватного чата - устанавливаем leftAt
    await prisma.chatParticipant.updateMany({
      where: {
        chatId: testData.privateChat!.id,
        userId: testData.user2!.id,
      },
      data: { leftAt: new Date() },
    });
    
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatId: testData.privateChat!.id,
        userId: testData.user2!.id,
      },
    });
    
    if (!participant?.leftAt) {
      throw new Error("leftAt не установлен при выходе");
    }
  });

  // 3.5 Получение списка участников
  await runTest("3.5 Получение списка активных участников чата", async () => {
    const participants = await prisma.chatParticipant.findMany({
      where: {
        chatId: testData.groupChat!.id,
        leftAt: null,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    
    logInfo(`Активных участников: ${participants.length}`);
    
    if (participants.length === 0) {
      throw new Error("Нет активных участников");
    }
  });
}

// ============================================================================
// ТЕСТЫ ПАПОК
// ============================================================================

async function testFolders() {
  logSection("4. ТЕСТЫ ПАПОК");

  // 4.1 Создание папки
  await runTest("4.1 Создание папки с чатами", async () => {
    const folder = await prisma.chatFolder.create({
      data: {
        id: randomUUID(),
        name: `${TEST_PREFIX}FOLDER`,
        createdById: testData.user1!.id,
        icon: "📁",
        color: "#3B82F6",
        order: 0,
        chats: {
          create: [
            { chatId: testData.groupChat!.id },
            { chatId: testData.channelChat!.id },
          ],
        },
      },
      include: { chats: true },
    });
    testData.folder = { id: folder.id };

    if (folder.chats.length !== 2) {
      throw new Error(`Ожидалось 2 чата в папке, получено ${folder.chats.length}`);
    }
  });

  // 4.2 Получение папок пользователя
  await runTest("4.2 Получение списка папок пользователя", async () => {
    const folders = await prisma.chatFolder.findMany({
      where: { createdById: testData.user1!.id },
      include: {
        chats: {
          include: {
            chat: true,
          },
        },
      },
    });

    if (folders.length === 0) {
      throw new Error("Папки не найдены");
    }
    
    logInfo(`Найдено папок: ${folders.length}`);
  });

  // 4.3 Добавление чата в папку
  await runTest("4.3 Добавление чата в существующую папку", async () => {
    await prisma.chatFolderChat.create({
      data: {
        folderId: testData.folder!.id,
        chatId: testData.meetingChat!.id,
      },
    });

    const folder = await prisma.chatFolder.findUnique({
      where: { id: testData.folder!.id },
      include: { chats: true },
    });

    if (folder?.chats.length !== 3) {
      throw new Error(`Ожидалось 3 чата в папке, получено ${folder?.chats.length}`);
    }
  });

  // 4.4 Удаление чата из папки
  await runTest("4.4 Удаление чата из папки", async () => {
    await prisma.chatFolderChat.deleteMany({
      where: {
        folderId: testData.folder!.id,
        chatId: testData.meetingChat!.id,
      },
    });

    const folder = await prisma.chatFolder.findUnique({
      where: { id: testData.folder!.id },
      include: { chats: true },
    });

    if (folder?.chats.length !== 2) {
      throw new Error(`Ожидалось 2 чата после удаления, получено ${folder?.chats.length}`);
    }
  });

  // 4.5 Обновление папки
  await runTest("4.5 Обновление названия и цвета папки", async () => {
    await prisma.chatFolder.update({
      where: { id: testData.folder!.id },
      data: {
        name: `${TEST_PREFIX}FOLDER_UPDATED`,
        color: "#10B981",
        icon: "📂",
      },
    });

    const folder = await prisma.chatFolder.findUnique({
      where: { id: testData.folder!.id },
    });

    if (folder?.color !== "#10B981") {
      throw new Error("Цвет не обновился");
    }
    if (folder?.icon !== "📂") {
      throw new Error("Иконка не обновилась");
    }
  });

  // 4.6 Подсчет чатов в папке
  await runTest("4.6 Подсчет чатов в папке и проверка связей", async () => {
    const folder = await prisma.chatFolder.findUnique({
      where: { id: testData.folder!.id },
      include: {
        chats: {
          include: {
            chat: {
              include: {
                participants: {
                  where: { userId: testData.user1!.id, leftAt: null },
                },
              },
            },
          },
        },
      },
    });

    const chatCount = folder?.chats.length || 0;
    logInfo(`Чатов в папке: ${chatCount}`);
    
    if (chatCount !== 2) {
      throw new Error(`Ожидалось 2 чата в папке, получено ${chatCount}`);
    }
  });

  // 4.7 Удаление папки
  await runTest("4.7 Удаление папки (чаты остаются)", async () => {
    // Сохраняем ID чата для проверки
    const chatIdBeforeDelete = testData.groupChat!.id;
    
    // Сначала удаляем связи
    await prisma.chatFolderChat.deleteMany({
      where: { folderId: testData.folder!.id },
    });
    
    // Затем папку
    await prisma.chatFolder.delete({
      where: { id: testData.folder!.id },
    });

    // Проверяем что чаты на месте
    const chat = await prisma.chat.findUnique({
      where: { id: chatIdBeforeDelete },
    });

    if (!chat) {
      throw new Error("Чат был удален вместе с папкой");
    }
    
    testData.folder = undefined;
  });
}

// ============================================================================
// ТЕСТЫ АРХИВАЦИИ
// ============================================================================

async function testArchiving() {
  logSection("5. ТЕСТЫ АРХИВАЦИИ");

  // 5.1 Архивация чата
  await runTest("5.1 Архивация чата", async () => {
    await prisma.chat.update({
      where: { id: testData.groupChat!.id },
      data: { archivedAt: new Date() },
    });

    const chat = await prisma.chat.findUnique({
      where: { id: testData.groupChat!.id },
    });

    if (!chat?.archivedAt) {
      throw new Error("Чат не был архивирован");
    }
  });

  // 5.2 Проверка фильтрации архивированных чатов
  await runTest("5.2 Фильтрация архивированных чатов", async () => {
    const activeChats = await prisma.chat.findMany({
      where: {
        name: { startsWith: TEST_PREFIX },
        archivedAt: null,
      },
    });

    const archivedChats = await prisma.chat.findMany({
      where: {
        name: { startsWith: TEST_PREFIX },
        archivedAt: { not: null },
      },
    });

    logInfo(`Активных чатов: ${activeChats.length}, Архивированных: ${archivedChats.length}`);

    if (archivedChats.length === 0) {
      throw new Error("Нет архивированных чатов");
    }
  });

  // 5.3 Разархивация чата
  await runTest("5.3 Разархивация чата", async () => {
    await prisma.chat.update({
      where: { id: testData.groupChat!.id },
      data: { archivedAt: null },
    });

    const chat = await prisma.chat.findUnique({
      where: { id: testData.groupChat!.id },
    });

    if (chat?.archivedAt) {
      throw new Error("Чат не был разархивирован");
    }
  });

  // 5.4 Симуляция автоархивации (как при закрытии тикета)
  await runTest("5.4 Симуляция автоархивации при закрытии тикета", async () => {
    // Архивируем чат "заседания" как симуляцию
    await prisma.chat.update({
      where: { id: testData.meetingChat!.id },
      data: { archivedAt: new Date() },
    });

    const chat = await prisma.chat.findUnique({
      where: { id: testData.meetingChat!.id },
    });

    if (!chat?.archivedAt) {
      throw new Error("Чат не был автоархивирован");
    }
  });
}

// ============================================================================
// ТЕСТЫ ОЧИСТКИ И УДАЛЕНИЯ
// ============================================================================

async function testCleanupAndDelete() {
  logSection("6. ТЕСТЫ ОЧИСТКИ И УДАЛЕНИЯ");

  // 6.1 Очистка истории чата (для всех)
  await runTest("6.1 Очистка истории чата (удаление всех сообщений)", async () => {
    // Создаем несколько сообщений в канале
    for (let i = 0; i < 5; i++) {
      await prisma.chatMessage.create({
        data: {
          id: randomUUID(),
          chatId: testData.channelChat!.id,
          senderId: testData.user1!.id,
          content: `Сообщение ${i + 1}`,
          messageType: "text",
        },
      });
    }

    const beforeCount = await prisma.chatMessage.count({
      where: { chatId: testData.channelChat!.id },
    });

    // Очищаем - сначала удаляем связанные данные
    const messagesToDelete = await prisma.chatMessage.findMany({
      where: { chatId: testData.channelChat!.id },
      select: { id: true },
    });
    const msgIds = messagesToDelete.map(m => m.id);
    
    await prisma.chatMessageReaction.deleteMany({ where: { messageId: { in: msgIds } } });
    await prisma.chatMessageRead.deleteMany({ where: { messageId: { in: msgIds } } });
    await prisma.chatMessageAttachment.deleteMany({ where: { messageId: { in: msgIds } } });
    await prisma.chatMessage.deleteMany({
      where: { chatId: testData.channelChat!.id },
    });

    const afterCount = await prisma.chatMessage.count({
      where: { chatId: testData.channelChat!.id },
    });

    logInfo(`До очистки: ${beforeCount}, После: ${afterCount}`);

    if (afterCount !== 0) {
      throw new Error("Сообщения не были удалены");
    }
  });

  // 6.2 Очистка для одного пользователя (clearedAt)
  await runTest("6.2 Очистка истории для одного пользователя (clearedAt)", async () => {
    await prisma.chatParticipant.updateMany({
      where: {
        chatId: testData.groupChat!.id,
        userId: testData.user1!.id,
      },
      data: { clearedAt: new Date() },
    });
    
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatId: testData.groupChat!.id,
        userId: testData.user1!.id,
      },
    });
    
    if (!participant?.clearedAt) {
      throw new Error("clearedAt не установлен");
    }
    
    logInfo("Сообщения до clearedAt будут скрыты для пользователя");
  });

  // 6.3 Удаление группового чата
  await runTest("6.3 Удаление группового чата", async () => {
    // Создаем чат для удаления
    const chatToDelete = await prisma.chat.create({
      data: {
        id: randomUUID(),
        type: "GROUP",
        name: `${TEST_PREFIX}TO_DELETE`,
        createdById: testData.user1!.id,
        participants: {
          create: [
            { userId: testData.user1!.id, role: "admin" },
          ],
        },
      },
    });

    // Удаляем участников
    await prisma.chatParticipant.deleteMany({
      where: { chatId: chatToDelete.id },
    });

    // Удаляем чат
    await prisma.chat.delete({
      where: { id: chatToDelete.id },
    });

    // Проверяем
    const deleted = await prisma.chat.findUnique({
      where: { id: chatToDelete.id },
    });

    if (deleted) {
      throw new Error("Чат не был удален");
    }
  });
}

// ============================================================================
// ТЕСТЫ ПОИСКА И ФИЛЬТРАЦИИ
// ============================================================================

async function testSearchAndFilter() {
  logSection("7. ТЕСТЫ ПОИСКА И ФИЛЬТРАЦИИ");

  // 7.1 Поиск чатов по названию
  await runTest("7.1 Поиск чатов по названию", async () => {
    const chats = await prisma.chat.findMany({
      where: {
        name: { contains: "GROUP" },
      },
    });

    logInfo(`Найдено чатов с GROUP в названии: ${chats.length}`);
  });

  // 7.2 Фильтрация чатов по типу
  await runTest("7.2 Фильтрация чатов по типу", async () => {
    const groups = await prisma.chat.findMany({
      where: { type: "GROUP", name: { startsWith: TEST_PREFIX } },
    });
    const channels = await prisma.chat.findMany({
      where: { type: "CHANNEL", name: { startsWith: TEST_PREFIX } },
    });
    const privateChats = await prisma.chat.findMany({
      where: { type: "PRIVATE", name: { startsWith: TEST_PREFIX } },
    });

    logInfo(`GROUP: ${groups.length}, CHANNEL: ${channels.length}, PRIVATE: ${privateChats.length}`);
  });

  // 7.3 Получение чатов пользователя
  await runTest("7.3 Получение чатов конкретного пользователя", async () => {
    const userChats = await prisma.chat.findMany({
      where: {
        participants: {
          some: { 
            userId: testData.user1!.id,
            leftAt: null,
          },
        },
        name: { startsWith: TEST_PREFIX },
      },
    });

    logInfo(`У пользователя ${userChats.length} тестовых чатов`);
  });

  // 7.4 Сортировка по последнему сообщению
  await runTest("7.4 Сортировка чатов по последнему сообщению", async () => {
    const chats = await prisma.chat.findMany({
      where: { name: { startsWith: TEST_PREFIX } },
      orderBy: { lastMessageAt: "desc" },
    });

    logInfo(`Отсортировано ${chats.length} чатов`);
  });

  // 7.5 Поиск сообщений в чате
  await runTest("7.5 Поиск сообщений по содержимому", async () => {
    const messages = await prisma.chatMessage.findMany({
      where: {
        chatId: testData.groupChat!.id,
        content: { contains: "ОТРЕДАКТИРОВАННОЕ" },
      },
    });

    logInfo(`Найдено сообщений с ключевым словом: ${messages.length}`);
  });
}

// ============================================================================
// ТЕСТЫ СИСТЕМНЫХ ФУНКЦИЙ
// ============================================================================

async function testSystemFunctions() {
  logSection("8. ТЕСТЫ СИСТЕМНЫХ ФУНКЦИЙ");

  // 8.1 Обновление lastMessageAt при отправке сообщения
  await runTest("8.1 Обновление lastMessageAt при отправке сообщения", async () => {
    const before = await prisma.chat.findUnique({
      where: { id: testData.groupChat!.id },
      select: { lastMessageAt: true },
    });

    // Небольшая задержка
    await new Promise(resolve => setTimeout(resolve, 100));

    const newMessage = await prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        chatId: testData.groupChat!.id,
        senderId: testData.user1!.id,
        content: "Тест обновления lastMessageAt",
        messageType: "text",
      },
    });

    await prisma.chat.update({
      where: { id: testData.groupChat!.id },
      data: { 
        lastMessageAt: new Date(),
        lastMessageId: newMessage.id,
      },
    });

    const after = await prisma.chat.findUnique({
      where: { id: testData.groupChat!.id },
      select: { lastMessageAt: true },
    });

    if (before?.lastMessageAt?.getTime() === after?.lastMessageAt?.getTime()) {
      throw new Error("lastMessageAt не обновился");
    }
  });

  // 8.2 Проверка уникальности участников
  await runTest("8.2 Проверка уникальности участников в чате", async () => {
    // Попытка добавить дубликат должна вызвать ошибку
    try {
      await prisma.chatParticipant.create({
        data: {
          chatId: testData.groupChat!.id,
          userId: testData.user1!.id, // уже есть
          role: "member",
        },
      });
      throw new Error("Дубликат участника был создан");
    } catch (error: any) {
      if (error.code === 'P2002') {
        logInfo("Уникальность участников соблюдается (получена ошибка P2002)");
      } else if (error.message === "Дубликат участника был создан") {
        throw error;
      } else {
        logInfo(`Получена ошибка: ${error.message}`);
      }
    }
  });

  // 8.3 Каскадное удаление сообщений при удалении чата
  await runTest("8.3 Каскадное удаление сообщений при удалении чата", async () => {
    // Создаем тестовый чат с сообщениями
    const testChat = await prisma.chat.create({
      data: {
        id: randomUUID(),
        type: "GROUP",
        name: `${TEST_PREFIX}CASCADE_TEST`,
        createdById: testData.user1!.id,
        participants: {
          create: [{ userId: testData.user1!.id, role: "admin" }],
        },
      },
    });
    
    // Добавляем сообщения
    for (let i = 0; i < 3; i++) {
      await prisma.chatMessage.create({
        data: {
          id: randomUUID(),
          chatId: testChat.id,
          senderId: testData.user1!.id,
          content: `Каскадное сообщение ${i}`,
          messageType: "text",
        },
      });
    }
    
    // Удаляем чат (сообщения должны удалиться каскадно)
    await prisma.chat.delete({
      where: { id: testChat.id },
    });
    
    // Проверяем что сообщений нет
    const messages = await prisma.chatMessage.count({
      where: { chatId: testChat.id },
    });
    
    if (messages > 0) {
      throw new Error("Сообщения не удалились каскадно");
    }
    
    logInfo("Каскадное удаление работает корректно");
  });

  // 8.4 Проверка связи чата с lastMessage
  await runTest("8.4 Проверка связи lastMessage", async () => {
    const chat = await prisma.chat.findUnique({
      where: { id: testData.groupChat!.id },
      include: { lastMessage: true },
    });
    
    if (chat?.lastMessageId && !chat?.lastMessage) {
      throw new Error("lastMessage не загружен");
    }
    
    if (chat?.lastMessage) {
      logInfo(`Последнее сообщение: "${chat.lastMessage.content.substring(0, 30)}..."`);
    }
  });
}

// ============================================================================
// ФИНАЛЬНЫЙ ОТЧЕТ
// ============================================================================

function printFinalReport() {
  logSection("ИТОГОВЫЙ ОТЧЕТ");

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;
  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n${COLORS.bright}Всего тестов: ${total}${COLORS.reset}`);
  console.log(`${COLORS.green}Пройдено: ${passed}${COLORS.reset}`);
  console.log(`${COLORS.red}Провалено: ${failed}${COLORS.reset}`);
  console.log(`${COLORS.blue}Общее время: ${totalDuration}ms${COLORS.reset}\n`);

  if (failed > 0) {
    console.log(`${COLORS.red}${COLORS.bright}Проваленные тесты:${COLORS.reset}`);
    testResults
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`${COLORS.red}  ✗ ${r.name}${COLORS.reset}`);
        console.log(`    ${r.error}`);
      });
  }

  console.log(`\n${"═".repeat(70)}`);
  
  if (failed === 0) {
    console.log(`${COLORS.green}${COLORS.bright}ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!${COLORS.reset}`);
  } else {
    console.log(`${COLORS.red}${COLORS.bright}ЕСТЬ ПРОВАЛЕННЫЕ ТЕСТЫ${COLORS.reset}`);
  }
  
  console.log(`${"═".repeat(70)}\n`);
}

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================================================

async function main() {
  console.log(`\n${COLORS.magenta}${COLORS.bright}`);
  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║       КОМПЛЕКСНЫЙ ТЕСТ ВСЕХ ФУНКЦИЙ ЧАТА                          ║");
  console.log("║       MyUnion Pro - Chat Comprehensive Test Suite                  ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");
  console.log(`${COLORS.reset}\n`);

  try {
    // Подготовка
    await cleanupTestData();
    await createTestUsers();

    // Тесты
    await testChatCreation();
    await testMessages();
    await testParticipants();
    await testFolders();
    await testArchiving();
    await testCleanupAndDelete();
    await testSearchAndFilter();
    await testSystemFunctions();

    // Очистка после тестов
    logSection("ОЧИСТКА ПОСЛЕ ТЕСТОВ");
    await cleanupTestData();
    logSuccess("Все тестовые данные удалены");

  } catch (error) {
    logError(`Критическая ошибка: ${error}`);
    throw error;
  } finally {
    printFinalReport();
    await prisma.$disconnect();
  }
}

// Запуск
main()
  .then(() => {
    const failed = testResults.filter(r => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error("Фатальная ошибка:", error);
    process.exit(1);
  });
