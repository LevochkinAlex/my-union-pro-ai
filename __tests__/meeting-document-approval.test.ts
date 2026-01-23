/**
 * Тесты для API документооборота заседаний
 * 
 * Тестируемые endpoints:
 * - POST /api/ppo-head/meetings/[id]/documents/[documentId]/send-for-approval
 * - POST /api/ppo-head/meetings/[id]/documents/[documentId]/approve
 * - POST /api/ppo-head/meetings/[id]/documents/[documentId]/final-approve
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('Meeting Document Approval API', () => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';
  let testMeetingId: string;
  let testDocumentId: string;
  let testUserId: string;
  let testParticipantId: string;
  let authToken: string;

  beforeAll(async () => {
    // Здесь должна быть инициализация тестовых данных
    // В реальном проекте это может быть через test database или fixtures
    console.log('⚠️  Тесты требуют реальной базы данных и аутентификации');
    console.log('⚠️  Для запуска тестов необходимо:');
    console.log('   1. Настроить тестовую базу данных');
    console.log('   2. Создать тестовых пользователей (председатель и участник)');
    console.log('   3. Создать тестовое заседание');
    console.log('   4. Создать тестовый документ');
    console.log('   5. Получить токен аутентификации');
  });

  describe('POST /api/ppo-head/meetings/[id]/documents/[documentId]/send-for-approval', () => {
    it('должен отправлять документ на согласование участникам', async () => {
      // Тест требует:
      // - Документ в статусе DRAFT
      // - Заседание с участниками
      // - Аутентифицированный председатель
      
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/send-for-approval`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.document.status).toBe('PENDING_APPROVAL');
      expect(data.document.approvals.length).toBeGreaterThan(0);
    });

    it('должен возвращать ошибку, если документ не в статусе DRAFT', async () => {
      // Тест требует документ в статусе PENDING_APPROVAL или COMPLETED
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/send-for-approval`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('уже отправлен на согласование');
    });

    it('должен возвращать ошибку, если документ не связан с заседанием', async () => {
      // Тест требует документ, не связанный с заседанием
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/send-for-approval`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('не связан с этим заседанием');
    });
  });

  describe('POST /api/ppo-head/meetings/[id]/documents/[documentId]/approve', () => {
    it('должен согласовывать документ участником', async () => {
      // Тест требует:
      // - Документ в статусе PENDING_APPROVAL
      // - Запись согласования для участника
      // - Аутентифицированный участник
      
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
          body: JSON.stringify({ comment: 'Согласовано' }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Документ согласован');
      expect(data.allApproved).toBeDefined();
    });

    it('должен возвращать ошибку, если документ не на согласовании', async () => {
      // Тест требует документ в статусе DRAFT или COMPLETED
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('должен быть на согласовании');
    });

    it('должен возвращать ошибку, если пользователь не участник', async () => {
      // Тест требует пользователя, не являющегося участником
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('не являетесь участником');
    });
  });

  describe('POST /api/ppo-head/meetings/[id]/documents/[documentId]/final-approve', () => {
    it('должен утверждать документ председателем после всех согласований', async () => {
      // Тест требует:
      // - Документ в статусе PENDING_APPROVAL
      // - Все участники согласовали документ
      // - Аутентифицированный председатель
      
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/final-approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
          body: JSON.stringify({ comment: 'Утверждено' }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.document.status).toBe('COMPLETED');
      expect(data.message).toBe('Документ успешно утвержден');
    });

    it('должен возвращать ошибку, если не все участники согласовали', async () => {
      // Тест требует документ с неполными согласованиями
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/final-approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Не все участники согласовали');
      expect(data.pendingCount).toBeGreaterThan(0);
    });

    it('должен возвращать ошибку, если пользователь не председатель', async () => {
      // Тест требует пользователя, не являющегося председателем
      const response = await fetch(
        `${baseUrl}/api/ppo-head/meetings/${testMeetingId}/documents/${testDocumentId}/final-approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `next-auth.session-token=${authToken}`,
          },
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('Только председатель может утвердить');
    });
  });

  afterAll(async () => {
    // Очистка тестовых данных
    console.log('🧹 Очистка тестовых данных');
  });
});
