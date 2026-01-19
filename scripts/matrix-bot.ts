/**
 * MyUnion AI Bot for Matrix
 * Персонализированный бот с загрузкой профиля пользователя
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MATRIX_HOMESERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const BOT_ACCESS_TOKEN = process.env.MATRIX_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const BOT_NAME = 'МойСоюз Помощник';
const BOT_USER_ID = '@myunion_bot:matrix.myunion.pro';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface UserProfile {
  name: string;
  organization?: string;
  position?: string;
  membershipStatus?: string;
  interests?: string[];
  knowledgeContent?: string; // Данные из базы знаний
}

// Store conversations per room
const conversations = new Map<string, ConversationMessage[]>();
// Cache user profiles
const userProfiles = new Map<string, UserProfile>();
// Cache matrix to user id mapping
const matrixToUserId = new Map<string, string>();
let syncToken: string | null = null;

// Send push notification to user
async function sendPushToUser(matrixUserId: string, title: string, body: string): Promise<void> {
  try {
    // Get user ID from cache or DB
    let userId = matrixToUserId.get(matrixUserId);
    
    if (!userId) {
      const user = await prisma.user.findFirst({
        where: { matrixUserId },
        select: { id: true }
      });
      if (user) {
        userId = user.id;
        matrixToUserId.set(matrixUserId, userId);
      }
    }
    
    if (!userId) return;
    
    // Send push via API
    const baseUrl = process.env.NEXTAUTH_URL || 'https://myunion.pro';
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_API_TOKEN || '',
      },
      body: JSON.stringify({
        userId,
        title,
        message: body,
        data: { url: '/dashboard/chat' },
      }),
    });
  } catch (err) {
    // Silently ignore push errors
  }
}

// Base system prompt
const BASE_SYSTEM_PROMPT = `Ты — AI-ассистент профсоюзной системы MyUnion Pro. Ты дружелюбный и полезный помощник.

ТВОИ ЗАДАЧИ:
- Помогать членам профсоюза с вопросами о членстве, взносах, документах
- Объяснять права и обязанности членов профсоюза  
- Помогать с заполнением заявлений и документов
- Отвечать на вопросы о скидках и льготах для членов профсоюза
- Направлять к председателю ППО по сложным вопросам
- Подсказывать где найти нужные разделы системы

РАЗДЕЛЫ СИСТЕМЫ:
- Профиль — заполнение данных, фото, документы автоматически генерируются
- Документы — просмотр сгенерированных документов
- Обращения — создание заявлений, жалоб, запросов к руководству
- Новости — новости профсоюза
- Скидки — партнёрские скидки для членов профсоюза
- Чат — переписка с председателем и другими членами

ПРАВИЛА:
- Обращайся к пользователю по имени если оно известно
- Отвечай кратко и по существу (2-4 предложения)
- Используй эмодзи для дружелюбности
- Если не знаешь ответ — предложи обратиться к председателю

НЕ ДЕЛАЙ:
- Не давай юридических советов
- Не обсуждай политику
- Не собирай личные данные — направляй в раздел Профиль`;

// Function to get user profile from DB with knowledge base
async function getUserProfile(matrixUserId: string): Promise<UserProfile | null> {
  // Check cache first
  if (userProfiles.has(matrixUserId)) {
    return userProfiles.get(matrixUserId)!;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { matrixUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        jobTitle: true,
        membershipStatus: true,
        hobbies: true,
        aboutMe: true,
        organization: {
          select: { name: true }
        },
        userKnowledgeBase: {
          include: {
            chunks: {
              orderBy: { createdAt: 'desc' },
              take: 10 // Берем последние 10 фрагментов
            }
          }
        }
      }
    });

    if (!user) return null;

    // Собираем контент из базы знаний
    let knowledgeContent = '';
    if (user.userKnowledgeBase?.chunks) {
      const chunks = user.userKnowledgeBase.chunks;
      const profileChunks = chunks.filter(c => c.type === 'PROFILE_DATA');
      const noteChunks = chunks.filter(c => c.type === 'NOTE');
      const historyChunks = chunks.filter(c => c.type === 'HISTORY');
      const preferenceChunks = chunks.filter(c => c.type === 'PREFERENCE');
      
      if (profileChunks.length > 0) {
        knowledgeContent += '\n--- ДАННЫЕ ПРОФИЛЯ ---\n' + profileChunks[0].content;
      }
      if (noteChunks.length > 0) {
        knowledgeContent += '\n\n--- ЗАМЕТКИ АДМИНИСТРАТОРА ---\n' + noteChunks.map(c => c.content).join('\n');
      }
      if (preferenceChunks.length > 0) {
        knowledgeContent += '\n\n--- ПРЕДПОЧТЕНИЯ ---\n' + preferenceChunks.map(c => c.content).join('\n');
      }
      if (historyChunks.length > 0) {
        knowledgeContent += '\n\n--- ИСТОРИЯ ---\n' + historyChunks.slice(0, 3).map(c => c.content).join('\n');
      }
    }

    const profile: UserProfile = {
      name: [user.firstName, user.middleName].filter(Boolean).join(' ') || 'Пользователь',
      organization: user.organization?.name,
      position: user.jobTitle || undefined,
      membershipStatus: user.membershipStatus || undefined,
      interests: user.hobbies ? [user.hobbies] : undefined,
      knowledgeContent: knowledgeContent || undefined,
    };

    // Cache the profile
    userProfiles.set(matrixUserId, profile);
    return profile;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

// Build personalized system prompt with knowledge base
function buildSystemPrompt(profile: UserProfile | null): string {
  if (!profile) return BASE_SYSTEM_PROMPT;

  let prompt = BASE_SYSTEM_PROMPT + '\n\n';
  prompt += '=== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ (БАЗА ЗНАНИЙ) ===\n';
  prompt += `Имя: ${profile.name}\n`;
  
  if (profile.organization) {
    prompt += `Организация: ${profile.organization}\n`;
  }
  if (profile.position) {
    prompt += `Должность: ${profile.position}\n`;
  }
  if (profile.membershipStatus) {
    const statusText = profile.membershipStatus === 'ACTIVE' ? 'Активный член профсоюза' :
                       profile.membershipStatus === 'PENDING' ? 'Заявка на вступление' :
                       profile.membershipStatus === 'INACTIVE' ? 'Неактивный' : profile.membershipStatus;
    prompt += `Статус: ${statusText}\n`;
  }
  if (profile.interests && profile.interests.length > 0) {
    prompt += `Интересы/Хобби: ${profile.interests.join(', ')}\n`;
  }
  
  // Добавляем данные из базы знаний
  if (profile.knowledgeContent) {
    prompt += profile.knowledgeContent;
  }
  
  prompt += '\n\n=== ВАЖНО ===\n';
  prompt += '- Обращайся к пользователю по имени\n';
  prompt += '- Учитывай всю информацию из базы знаний в ответах\n';
  prompt += '- Если есть заметки администратора — учитывай их\n';
  prompt += '- Персонализируй ответы на основе профиля и предпочтений';
  
  return prompt;
}

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

async function callAI(messages: ConversationMessage[], profile: UserProfile | null): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not set!');
    return 'AI временно недоступен. Пожалуйста, обратитесь к председателю ППО.';
  }

  const systemPrompt = buildSystemPrompt(profile);

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
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10),
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return 'Извините, произошла ошибка. Попробуйте позже. 😔';
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || 'Извините, не могу ответить на этот вопрос.';
  } catch (error) {
    console.error('AI call error:', error);
    return 'Извините, произошла ошибка при обработке запроса. 😔';
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
    
    // Don't send automatic welcome - wait for user's first message
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

// Send notification for chat message
async function notifyChatMessage(roomId: string, event: MatrixEvent): Promise<void> {
  try {
    const senderMatrixId = event.sender || '';
    const messageText = event.content?.body || '';
    
    // Get user ID from matrixUserId
    const user = await prisma.user.findFirst({
      where: { matrixUserId: senderMatrixId },
      select: { id: true },
    });
    
    if (!user) {
      console.log(`[notify] User not found for ${senderMatrixId}`);
      return;
    }
    
    // Call notify API with internal token
    const baseUrl = process.env.NEXTAUTH_URL || 'https://myunion.pro';
    const response = await fetch(`${baseUrl}/api/chat/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_API_TOKEN || '',
      },
      body: JSON.stringify({
        roomId,
        message: messageText,
        senderUserId: user.id,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[notify] Failed to send notification: ${response.status} ${errorText}`);
    } else {
      console.log(`[notify] ✅ Notification sent for message in ${roomId}`);
    }
  } catch (error) {
    console.error('[notify] Error sending notification:', error);
  }
}

async function handleMessage(roomId: string, event: MatrixEvent): Promise<void> {
  // Ignore our own messages
  if (event.sender === BOT_USER_ID) return;
  
  // Only respond to text messages
  if (event.type !== 'm.room.message' || event.content?.msgtype !== 'm.text') return;
  
  const messageText = event.content?.body?.trim();
  if (!messageText) return;

  const senderMatrixId = event.sender || '';
  console.log(`[${roomId}] ${senderMatrixId}: ${messageText}`);

  // Get user profile for personalization
  const userProfile = await getUserProfile(senderMatrixId);
  if (userProfile) {
    console.log(`  -> User: ${userProfile.name}, Org: ${userProfile.organization || 'N/A'}`);
  }

  // Get or create conversation (fresh start - no history)
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
    // Get AI response with user profile
    const response = await callAI(conversation, userProfile);

    // Add assistant response
    conversation.push({ role: 'assistant', content: response });

    // Keep conversation history short (last 10 exchanges)
    if (conversation.length > 20) {
      conversation.splice(0, conversation.length - 20);
    }

    // Stop typing and send response
    await setTyping(roomId, false);
    await sendMessage(roomId, response);
    
    // Send push notification to user
    await sendPushToUser(senderMatrixId, 'МойСоюз Помощник', response.slice(0, 100));

  } catch (error) {
    console.error('Error handling message:', error);
    await setTyping(roomId, false);
    await sendMessage(roomId, 'Извините, произошла ошибка. Попробуйте ещё раз. 😔');
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
        // Handle bot messages
        await handleMessage(roomId, event);
        
        // Also send notifications for all user messages (not just bot messages)
        if (event.sender !== BOT_USER_ID && event.content?.msgtype === 'm.text') {
          await notifyChatMessage(roomId, event);
        }
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

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
