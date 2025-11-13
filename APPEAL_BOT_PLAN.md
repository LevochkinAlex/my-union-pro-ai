# Appeal Bot Implementation Plan

## Overview
Create a specialized bot for collecting user requests/appeals related to union matters with analytics and document storage capabilities.

## Architecture

### 1. Appeal Bot with Knowledge Base
- **Separate ChatBot** from the profile collection bot
- **New Knowledge Base** specifically for appeals (union documents from `/public/docs/union`)
- **Document types**: Legal, accounting, technical, other
- **Flow**: Collect -> Categorize -> Store -> Transmit to organization

### 2. Database Schema (Already Implemented)
```
UserAppeal
├─ id (cuid)
├─ userId (FK → User)
├─ type (AppealType: LEGAL, ACCOUNTING, TECHNICAL, OTHER)
├─ status (AppealStatus: DRAFT, SUBMITTED, IN_REVIEW, RESOLVED, REJECTED)
├─ title (String)
├─ description (Text)
├─ question (Text)
├─ tags (JSON - for analytics)
├─ resolved (Boolean)
├─ resolvedAt (DateTime)
├─ chatMessages (← ChatMessage.appealId)
└─ timestamps

AppealAnalytics
├─ id (cuid)
├─ appealType (AppealType)
├─ totalCount
├─ resolvedCount
├─ commonKeywords (JSON - extracted from appeals)
├─ averageResolutionTime (hours)
├─ period (periodStart, periodEnd)
└─ timestamps
```

## Implementation Steps

### Phase 1: Knowledge Base Upload (NEXT)
- [ ] Create script to extract text from DOCX/PDF files in `/public/docs/union`
- [ ] Create Knowledge Base for Appeals
- [ ] Upload documents as chunks with metadata (document type, category)
- [ ] Index documents for search

### Phase 2: Appeal Bot Configuration
- [ ] Create new ChatBot named "Appeal Bot" or "Request Assistant"
- [ ] Set specialized system prompt for collecting appeals
- [ ] Link to Appeal Knowledge Base
- [ ] Configure parameters (temperature, max tokens, etc.)

### Phase 3: Appeal Creation Flow
- [ ] Modify "New Chat" button to launch Appeal Bot
- [ ] Implement flow:
  1. **Greeting** - "What type of request do you have?"
  2. **Type Selection** - LEGAL / ACCOUNTING / TECHNICAL / OTHER
  3. **Problem Description** - "Describe your issue"
  4. **Details Collection** - Ask clarifying questions based on type
  5. **Document Upload** - Optional: upload supporting documents
  6. **Review** - Show summary for confirmation
  7. **Submit** - Create UserAppeal record, mark as SUBMITTED

### Phase 4: Appeal Management API
- [ ] `POST /api/appeals` - Create new appeal
- [ ] `GET /api/appeals` - List user's appeals
- [ ] `GET /api/appeals/:id` - Get appeal details with chat
- [ ] `PUT /api/appeals/:id` - Update appeal status (admin only)
- [ ] `DELETE /api/appeals/:id` - Delete appeal
- [ ] `GET /api/analytics/appeals` - Get analytics data

### Phase 5: Analytics Dashboard (FUTURE)
- [ ] View total appeals by type
- [ ] View resolution rates
- [ ] Extract common keywords/issues
- [ ] Trend analysis over time
- [ ] Export reports

### Phase 6: Admin Panel (FUTURE)
- [ ] View all appeals
- [ ] Filter by type, status, date
- [ ] Respond to appeals
- [ ] Change status
- [ ] View analytics

## Appeal Flow Example

```
User: "New Chat"
↓
Bot: "Привет! Какой тип помощи вам нужен?
     1. Юридический вопрос
     2. Бухгалтерский вопрос  
     3. Технический вопрос
     4. Прочее"
↓
User: "1" (Legal)
↓
Bot: "Опишите вашу правовую проблему"
↓
User: "У меня есть вопрос о правах работников при увольнении"
↓
Bot: "Это касается конкретного случая или общий вопрос? 
     Могли бы вы подробнее рассказать?"
↓
User: "Конкретный случай - мне грозит увольнение"
↓
Bot: "Это очень важно. Давайте соберем информацию:
     - Когда произошло?
     - Какая причина указана?
     - У вас есть трудовой контракт?"
↓
... (Continue conversation)
↓
Bot: "Спасибо! Я создам вашу заявку. Вот сводка:
     Тип: Юридический
     Проблема: Угроза увольнения...
     Хотите ли вы отправить эту заявку в профсоюз?"
↓
User: "Да"
↓
Bot: "Ваша заявка №12345 создана и отправлена на рассмотрение"
```

## Technical Details

### Document Processing
```typescript
// Process files from /public/docs/union
const files = readdirSync('public/docs/union');
for (const file of files) {
  if (file.endsWith('.docx')) {
    const text = extractTextFromDocx(file);
    await createKnowledgeChunk(text, {
      source: file,
      documentType: categorizeDocument(file),
      processedAt: new Date(),
    });
  }
}
```

### Appeal Creation
```typescript
// Create appeal from chat
const appeal = await prisma.userAppeal.create({
  data: {
    userId: session.user.id,
    type: appealType,
    title: extractedTitle,
    description: extractedDescription,
    question: userQuestion,
    tags: JSON.stringify(extractedKeywords),
    status: 'SUBMITTED',
  },
});

// Link chat messages to appeal
await prisma.chatMessage.updateMany({
  where: { /* messages from this conversation */ },
  data: { appealId: appeal.id },
});
```

### Analytics Generation
```typescript
// Aggregate daily/weekly
const analytics = await prisma.appealAnalytics.upsert({
  where: {
    appealType_periodStart_periodEnd: {
      appealType: 'LEGAL',
      periodStart: getPeriodStart(),
      periodEnd: getPeriodEnd(),
    }
  },
  create: { ... },
  update: {
    totalCount: { increment: 1 },
    commonKeywords: updateKeywords(...),
    averageResolutionTime: calculateAverage(...),
  },
});
```

## Files to Create/Modify

### API Routes
- [ ] `app/api/appeals/route.ts` - CRUD operations
- [ ] `app/api/appeals/[id]/route.ts` - Get/update specific appeal
- [ ] `app/api/analytics/appeals/route.ts` - Analytics queries
- [ ] `app/api/admin/appeals/route.ts` - Admin endpoints (bulk operations)

### Components
- [ ] `components/appeals/AppealChat.tsx` - Chat interface for appeals
- [ ] `components/appeals/AppealList.tsx` - User's appeals list
- [ ] `components/appeals/AppealDetails.tsx` - View specific appeal

### Pages
- [ ] `app/dashboard/appeals/page.tsx` - User appeals page
- [ ] `app/admin/appeals/page.tsx` - Admin appeals management

### Utilities
- [ ] `lib/document-extractor.ts` - Extract text from DOCX/PDF
- [ ] `lib/appeals/processor.ts` - Process and categorize appeals
- [ ] `lib/appeals/analytics.ts` - Calculate analytics

## Timeline Estimate

| Phase | Duration | Complexity |
|-------|----------|-----------|
| Phase 1 | 2-3 hours | Medium |
| Phase 2 | 1 hour | Low |
| Phase 3 | 4-6 hours | High |
| Phase 4 | 3-4 hours | Medium |
| Phase 5 | 4-5 hours | High |
| Phase 6 | 5-6 hours | High |

**Total: ~20-25 hours**

## Priority: PHASE 1 & 2 First

These phases are critical to get appeals system working:
1. Upload knowledge base documents
2. Create and configure Appeal Bot
3. Then integrate into chat flow

## Notes

- Keep appeals separate from profile collection for analytics
- Store all appeals for audit trail
- Enable offline analytics for reporting
- Plan for GDPR/privacy compliance in future

