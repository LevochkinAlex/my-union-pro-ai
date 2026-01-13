/**
 * MyUnion AI Bot for Matrix
 * Connects to Matrix server and responds to messages using AI
 */

import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  RichConsoleLogger,
  LogService,
} from 'matrix-bot-sdk';

// Configure logging
LogService.setLogger(new RichConsoleLogger());

const MATRIX_HOMESERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const BOT_ACCESS_TOKEN = process.env.MATRIX_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BOT_NAME = 'МойСоюз Бот';
const BOT_USER_ID = '@myunion_bot:matrix.myunion.pro';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Store conversations per room
const conversations: Map<string, ConversationMessage[]> = new Map();

// System prompt for the bot
const SYSTEM_PROMPT = `Ты — AI-ассистент профсоюзной системы MyUnion Pro.

Твои задачи:
- Помогать членам профсоюза с вопросами о членстве, взносах, документах
- Объяснять права и обязанности членов профсоюза
- Помогать с заполнением заявлений и документов
- Отвечать на вопросы о скидках и льготах для членов профсоюза
- Направлять к председателю ППО по сложным вопросам

Правила общения:
- Будь вежлив и профессионален
- Отвечай кратко и по существу
- Используй русский язык
- Если не знаешь ответ, честно скажи об этом
- При сложных юридических вопросах рекомендуй обратиться к председателю

Ты НЕ должен:
- Давать юридические советы
- Обсуждать политические темы
- Делиться личными данными пользователей`;

async function callAI(messages: ConversationMessage[]): Promise<string> {
  if (!OPENAI_API_KEY) {
    return 'AI временно недоступен. Пожалуйста, обратитесь к председателю ППО.';
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.slice(-10), // Keep last 10 messages for context
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      return 'Извините, произошла ошибка. Попробуйте позже.';
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'Извините, не могу ответить на этот вопрос.';
  } catch (error) {
    console.error('AI call error:', error);
    return 'Извините, произошла ошибка при обработке запроса.';
  }
}

async function handleMessage(
  client: MatrixClient,
  roomId: string,
  event: {
    type: string;
    sender: string;
    content: { body?: string; msgtype?: string };
    event_id: string;
  }
) {
  // Ignore our own messages
  if (event.sender === BOT_USER_ID) return;
  
  // Only respond to text messages
  if (event.type !== 'm.room.message' || event.content.msgtype !== 'm.text') return;
  
  const messageText = event.content.body?.trim();
  if (!messageText) return;

  console.log(`[${roomId}] ${event.sender}: ${messageText}`);

  // Get or create conversation
  let conversation = conversations.get(roomId);
  if (!conversation) {
    conversation = [];
    conversations.set(roomId, conversation);
  }

  // Add user message
  conversation.push({ role: 'user', content: messageText });

  // Send typing indicator
  await client.setTyping(roomId, true, 30000);

  try {
    // Get AI response
    const response = await callAI(conversation);

    // Add assistant response
    conversation.push({ role: 'assistant', content: response });

    // Keep conversation history manageable
    if (conversation.length > 50) {
      conversation.splice(0, conversation.length - 50);
    }

    // Stop typing and send response
    await client.setTyping(roomId, false);
    await client.sendText(roomId, response);

  } catch (error) {
    console.error('Error handling message:', error);
    await client.setTyping(roomId, false);
    await client.sendText(roomId, 'Извините, произошла ошибка. Попробуйте ещё раз.');
  }
}

async function handleInvite(client: MatrixClient, roomId: string, event: { sender: string }) {
  console.log(`Invited to ${roomId} by ${event.sender}`);
  
  try {
    await client.joinRoom(roomId);
    console.log(`Joined room ${roomId}`);
    
    // Send welcome message
    setTimeout(async () => {
      await client.sendText(
        roomId,
        `👋 Привет! Я ${BOT_NAME} — ваш AI-помощник по вопросам профсоюза.\n\n` +
        `Я могу помочь с:\n` +
        `• Вопросами о членстве и взносах\n` +
        `• Информацией о правах и льготах\n` +
        `• Заполнением документов\n` +
        `• Скидками для членов профсоюза\n\n` +
        `Просто напишите свой вопрос!`
      );
    }, 1000);
  } catch (error) {
    console.error(`Failed to join ${roomId}:`, error);
  }
}

async function main() {
  if (!BOT_ACCESS_TOKEN) {
    console.error('MATRIX_BOT_TOKEN not set. Please register the bot first.');
    console.log('\nTo register the bot, run:');
    console.log('docker exec synapse register_new_matrix_user -u myunion_bot -p <password> -c /data/homeserver.yaml http://localhost:8008');
    console.log('\nThen login to get access token:');
    console.log('curl -X POST "https://matrix.myunion.pro/_matrix/client/v3/login" -d \'{"type":"m.login.password","user":"myunion_bot","password":"<password>"}\'');
    process.exit(1);
  }

  // Storage for bot state
  const storage = new SimpleFsStorageProvider('bot-storage.json');

  // Create client
  const client = new MatrixClient(MATRIX_HOMESERVER, BOT_ACCESS_TOKEN, storage);

  // Auto-join rooms on invite
  AutojoinRoomsMixin.setupOnClient(client);

  // Handle messages
  client.on('room.message', (roomId: string, event: Parameters<typeof handleMessage>[2]) => {
    handleMessage(client, roomId, event);
  });

  // Handle invites
  client.on('room.invite', (roomId: string, event: Parameters<typeof handleInvite>[2]) => {
    handleInvite(client, roomId, event);
  });

  // Start the client
  console.log(`Starting ${BOT_NAME}...`);
  await client.start();
  console.log(`${BOT_NAME} is running!`);

  // Set bot profile
  try {
    await client.setDisplayName(BOT_NAME);
    console.log('Bot display name set');
  } catch (e) {
    console.warn('Could not set display name:', e);
  }
}

main().catch(console.error);
