# Appeal Bot - Feature Documentation

## Overview

Appeal Bot is a specialized AI assistant designed to handle union-related appeals, requests, and inquiries. It provides expert guidance on legal, accounting, technical, and administrative matters based on comprehensive union documentation.

## 🎯 Features Implemented

### 1. **Appeal Bot Knowledge Base**
- **17 Documents Loaded**: All union documentation from `/public/docs/union`
- **Supported Formats**: DOCX, PDF, DOC, XLS, JPG
- **Auto-Processing**: Documents are queued for async processing
- **Smart Retrieval**: Relevant documents retrieved for each query

### 2. **Web Push Notifications (OneSignal)**

#### Setup Requirements
```env
NEXT_PUBLIC_ONESIGNAL_APP_ID=your_app_id
ONESIGNAL_API_KEY=your_api_key
INTERNAL_API_TOKEN=your_internal_token
```

#### Features
- **Auto-Subscribe**: Users are prompted to enable notifications on first visit
- **Smart Notifications**: Sends preview of bot response (first 100 chars)
- **Non-Blocking**: Push failures don't affect chat functionality
- **Metadata**: Includes message type and bot ID for tracking

#### API Endpoints
```
POST /api/push/subscribe
- Stores OneSignal subscription ID
- Called automatically during initialization

POST /api/push/send
- Sends notifications to specific users
- Internal auth via X-Internal-Token
- Handles batch or single recipient sending
```

#### Implementation
- PushNotificationInit component in Providers
- Auto-sync on session creation
- Graceful degradation if OneSignal unavailable

### 3. **Appeals Analytics**

#### Tracked Data
- **Appeal Type**: LEGAL, ACCOUNTING, TECHNICAL, OTHER
- **Question Content**: For trend analysis
- **Keywords**: Automatically extracted (5 per question)
- **Resolution Time**: Optional tracking
- **Daily Aggregation**: Statistics compiled per day

#### Detection Algorithm
```typescript
Юридические (LEGAL):
- право, юридич, закон, статья, положение, устав, регламент, процедур

Бухгалтерские (ACCOUNTING):
- взнос, финанс, деньги, оплат, счет, налог, доход, расход

Технические (TECHNICAL):
- систем, сайт, приложение, техн, ошибка, баг, не работает

Прочие (OTHER):
- все остальные вопросы
```

#### Admin Dashboard
Location: `/admin/appeal-analytics`

Features:
- **Main Stats**: Total questions, resolved count, avg resolution time
- **Type Breakdown**: Visual distribution by appeal type
- **Common Keywords**: Top 20 keywords from all questions
- **Daily Records**: Detailed table with daily statistics
- **Filters**:
  - Time period (1 day, 7 days, 30 days, 90 days)
  - Appeal type (all types or specific)

### 4. **Appeal Bot System Prompt**

Enhanced prompt with:
- ✅ Clear responsibilities and capabilities
- ✅ Guidance on legal/complex matters
- ✅ Instructions for citing documents
- ✅ Tone and communication style
- ✅ Limitations and when to refer to lawyers
- ✅ Multi-language support (Russian)

## 🔧 Technical Architecture

### Database Models

#### PushSubscription
```prisma
model PushSubscription {
  id              String @id @default(cuid())
  userId          String
  user            User   @relation(...)
  oneSignalId     String
  subscriptionId  String?
  lastSyncAt      DateTime
  createdAt       DateTime
  updatedAt       DateTime
  
  @@unique([userId, oneSignalId])
}
```

#### AppealAnalytics (Extended)
```prisma
model AppealAnalytics {
  id                      String
  appealType              AppealType
  totalCount              Int
  resolvedCount           Int
  commonKeywords          String? // JSON
  averageResolutionTime   Float?
  periodStart             DateTime
  periodEnd               DateTime
  
  @@unique([appealType, periodStart, periodEnd])
}
```

### API Endpoints

#### Chat
```
POST /api/chat
- chatBotId (optional): Use specific bot (Appeal Bot)
- Auto-sends push on bot response
```

#### Push Notifications
```
POST /api/push/subscribe
- Save user's OneSignal subscription

POST /api/push/send
- Send notification to user(s)
- Requires INTERNAL_API_TOKEN
```

#### Analytics
```
POST /api/chat/analytics
- Track appeal question
- Auto-detect type and extract keywords

GET /api/chat/analytics
- Retrieve aggregated stats
- Filter by type and period
- Admin only
```

#### Appeal Bot
```
GET /api/chat/appeal-bot
- Get Appeal Bot ID
- Used for initializing Appeal Bot mode
```

## 🚀 Usage

### For Users

1. **Start Appeal Bot**
   - Click "Новый чат" (New Chat) button
   - Redirects to `/dashboard?mode=appeal`
   - Chat initializes with Appeal Bot

2. **Enable Notifications**
   - Browser prompt appears on first visit
   - Click "Разрешить" (Allow)
   - Receive push notifications for bot responses

3. **Ask Questions**
   - Type question about union matters
   - Analytics auto-tracked
   - Receive response based on knowledge base

### For Admins

1. **View Analytics**
   - Go to Admin Dashboard
   - Click "Appeal Bot Аналитика"
   - Filter by period and type

2. **Analyze Trends**
   - See common keywords users ask about
   - Identify top appeal types
   - Track resolution efficiency

## 📊 Analytics Examples

### Query Tracking
```
User Question: "Какой размер профвзноса в 2024?"
Detection: ACCOUNTING
Keywords: ["размер", "профвзноса", "2024"]
Type: Appeal
```

### Dashboard View
```
Main Stats:
- Total Questions: 156
- Resolved: 142
- Avg Time: 2.3h

By Type:
- LEGAL: 45% (70 questions)
- ACCOUNTING: 30% (47 questions)
- TECHNICAL: 15% (23 questions)
- OTHER: 10% (16 questions)

Top Keywords:
[взнос, право, регистрация, документ, статья, ...]
```

## 🔄 Async Document Processing

### Current Status: PENDING

**What needs to be done**:
1. Create async job queue (Bull/Redis or similar)
2. Process documents in background:
   - Extract text using `extractTextFromFile`
   - Split into chunks using `chunkText`
   - Generate embeddings via `generateEmbedding`
   - Store chunks in database
3. Track processing status in UI
4. Retry failed documents

**Files to modify**:
- `lib/knowledge/processor.ts` (already has logic)
- Need async queue job wrapper
- Need job status endpoints

## 🔐 Security

- **Push Notifications**: Internal token validation
- **Analytics**: User data stored securely
- **Admin Dashboard**: Role-based access (SUPER_ADMIN only)
- **OneSignal**: API key in env vars only

## 📱 Browser Support

- **Push Notifications**: 
  - Chrome/Edge: Full support
  - Firefox: Full support
  - Safari: Limited support
  - Mobile: Supported

## 🐛 Troubleshooting

### No Push Notifications
1. Check browser permissions
2. Verify OneSignal App ID in env
3. Check console for errors
4. Ensure HTTPS (push requires secure context)

### Analytics Not Showing
1. Verify Appeal Bot mode is active
2. Check admin role permissions
3. Ensure time period filter is correct

### Appeal Bot Not Working
1. Check Appeal Bot creation in DB
2. Verify Knowledge Base is linked
3. Check bot system prompt
4. Verify API provider is configured

## 📝 Next Steps

1. **Async Document Processing**: Implement background job queue
2. **Web Push Advanced**: Add action buttons to notifications
3. **Analytics Export**: CSV/PDF export functionality
4. **Multi-language**: Support other languages
5. **AI Improvements**: Fine-tune system prompt based on analytics

## 🔗 Related Files

- Documentation: `/APPEAL_BOT_PLAN.md`
- Script: `/scripts/load-appeal-bot-documents.mjs`
- Chat Component: `/components/chat/Chat.tsx`
- Analytics Library: `/lib/analytics.ts`
- Push Notifications: `/lib/push-notifications.ts`
- Admin Page: `/app/admin/appeal-analytics/page.tsx`

