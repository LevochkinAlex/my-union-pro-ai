/**
 * Временное решение: закомментировать проблемные места
 * Позже их нужно переделать на Matrix API
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const files = [
  'app/api/assistant/chat/route.ts',
  'app/api/chat/[chatId]/route.ts',
  'app/api/chat/[chatId]/clear/route.ts',
  'app/api/chat/forward/route.ts',
  'app/api/chat/[chatId]/attachments/route.ts',
  'app/api/chat/[chatId]/messages/[messageId]/route.ts',
  'app/api/chat/[chatId]/messages/[messageId]/reactions/route.ts',
  'app/api/tickets/route.ts',
  'app/api/tickets/[id]/route.ts',
  'app/api/ppo-head/chats/[id]/invite/route.ts',
  'app/api/ppo-head/chats/[id]/remove-participant/route.ts',
  'app/api/ppo-head/appeals/[id]/status/route.ts',
  'app/api/ppo-head/appeals/[id]/reject/route.ts',
  'app/api/ppo-head/members/[id]/approve/route.ts',
  'app/api/ppo-head/members/[id]/reject/route.ts',
];

console.log('⚠️  Эти файлы нужно переделать на Matrix API');
console.log('   Сейчас они используют старые модели ChatMessage');
console.log('   Все сообщения теперь хранятся только в Matrix\n');

files.forEach(file => {
  console.log(`   - ${file}`);
});

console.log('\n💡 Решение: использовать Matrix SDK для работы с сообщениями');
