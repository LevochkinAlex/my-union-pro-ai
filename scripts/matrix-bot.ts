/**
 * MyUnion AI Bot for Matrix
 * Simple bot using fetch API (no SDK dependencies)
 */

const MATRIX_HOMESERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const BOT_ACCESS_TOKEN = process.env.MATRIX_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BOT_NAME = 'МойСоюз Помощник';
const BOT_USER_ID = '@myunion_bot:matrix.myunion.pro';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Store conversations per room
const conversations = new Map<string, ConversationMessage[]>();
let syncToken: string | null = null;

// System prompt
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

Ты НЕ должен:
- Давать юридические советы
- Обсуждать политические темы
- Делиться личными данными пользователей`;

async function matrixFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${MATRIX_HOMESERVER}/_matrix/client/v3${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BOT_ACCESS_TOKEN}`,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Matrix API error: ${response.status} ${text}`);
  }
  
  return response.json();
}

async function callAI(messages: ConversationMessage[]): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not set!');
    return 'AI временно недоступен. Пожалуйста, обратитесь к председателю ППО.';
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://myunion.pro',
        'X-Title': 'MyUnion Pro AI Assistant',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.slice(-10),
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return 'Извините, произошла ошибка. Попробуйте позже.';
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || 'Извините, не могу ответить на этот вопрос.';
  } catch (error) {
    console.error('AI call error:', error);
    return 'Извините, произошла ошибка при обработке запроса.';
  }
}

async function sendMessage(roomId: string, text: string): Promise<void> {
  const txnId = `m${Date.now()}`;
  await matrixFetch(`/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
    method: 'PUT',
    body: JSON.stringify({
      msgtype: 'm.text',
      body: text,
    }),
  });
}

async function setTyping(roomId: string, typing: boolean): Promise<void> {
  try {
    await matrixFetch(`/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(BOT_USER_ID)}`, {
      method: 'PUT',
      body: JSON.stringify({ typing, timeout: typing ? 30000 : 0 }),
    });
  } catch {
    // Ignore typing errors
  }
}

async function joinRoom(roomId: string): Promise<void> {
  try {
    await matrixFetch(`/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      body: '{}',
    });
    console.log(`Joined room ${roomId}`);
    
    // Send welcome message
    setTimeout(() => {
      sendMessage(roomId,
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
    console.error(`Failed to join room ${roomId}:`, error);
  }
}

interface MatrixEvent {
  type: string;
  sender?: string;
  content?: {
    body?: string;
    msgtype?: string;
    membership?: string;
  };
  room_id?: string;
}

interface SyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<string, {
      timeline?: { events?: MatrixEvent[] };
    }>;
    invite?: Record<string, {
      invite_state?: { events?: MatrixEvent[] };
    }>;
  };
}

async function handleMessage(roomId: string, event: MatrixEvent): Promise<void> {
  // Ignore our own messages
  if (event.sender === BOT_USER_ID) return;
  
  // Only respond to text messages
  if (event.type !== 'm.room.message' || event.content?.msgtype !== 'm.text') return;
  
  const messageText = event.content?.body?.trim();
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
  await setTyping(roomId, true);

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
    await setTyping(roomId, false);
    await sendMessage(roomId, response);

  } catch (error) {
    console.error('Error handling message:', error);
    await setTyping(roomId, false);
    await sendMessage(roomId, 'Извините, произошла ошибка. Попробуйте ещё раз.');
  }
}

async function sync(): Promise<void> {
  const params = new URLSearchParams({
    timeout: syncToken ? '30000' : '0',
  });
  
  if (syncToken) {
    params.set('since', syncToken);
  }

  const data = await matrixFetch(`/sync?${params}`) as SyncResponse;
  syncToken = data.next_batch;

  // Handle invites
  const invites = data.rooms?.invite || {};
  for (const roomId of Object.keys(invites)) {
    console.log(`Invited to room ${roomId}`);
    await joinRoom(roomId);
  }

  // Handle messages
  const joined = data.rooms?.join || {};
  for (const [roomId, roomData] of Object.entries(joined)) {
    const events = roomData.timeline?.events || [];
    for (const event of events) {
      if (event.type === 'm.room.message') {
        await handleMessage(roomId, event);
      }
    }
  }
}

async function main(): Promise<void> {
  if (!BOT_ACCESS_TOKEN) {
    console.error('MATRIX_BOT_TOKEN not set!');
    process.exit(1);
  }

  console.log(`Starting ${BOT_NAME}...`);
  
  // Set bot display name
  try {
    await matrixFetch(`/profile/${encodeURIComponent(BOT_USER_ID)}/displayname`, {
      method: 'PUT',
      body: JSON.stringify({ displayname: BOT_NAME }),
    });
    console.log('Bot display name set');
  } catch (e) {
    console.warn('Could not set display name:', e);
  }

  console.log(`${BOT_NAME} is running! Waiting for messages...`);

  // Sync loop
  while (true) {
    try {
      await sync();
    } catch (error) {
      console.error('Sync error:', error);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(console.error);
