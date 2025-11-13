# Future Enhancements for Appeal System

## Roadmap Overview

This document outlines potential enhancements for the Appeal ID system and related features. Each enhancement is organized by priority and complexity.

---

## Phase 1: Quick Wins (1-2 sprints)

### 1. QR Codes for Appeals

**Objective**: Generate QR codes for easy appeal sharing and tracking

**Implementation**:
```typescript
// lib/appeal-qr.ts
import QRCode from 'qrcode';

export async function generateAppealQRCode(appealId: string, publicId: string) {
  const url = `${process.env.NEXTAUTH_URL}/dashboard/appeals/${appealId}`;
  const qrImage = await QRCode.toDataURL(url);
  return qrImage;
}
```

**UI Changes**:
- Add QR code display on appeal details page
- Download/print QR code button
- Email QR code with notification

**Database Changes**:
```sql
ALTER TABLE "UserAppeal" ADD COLUMN "qrCode" TEXT; -- Store QR image
```

**Estimated Time**: 4-6 hours

**Files to Create/Modify**:
- `lib/appeal-qr.ts` (NEW)
- `app/dashboard/appeals/[id]/page.tsx` (UPDATE)
- `app/api/appeals/[id]/qrcode/route.ts` (NEW)
- `components/appeal/QRCodeDisplay.tsx` (NEW)

---

### 2. Public Appeal Tracking Page

**Objective**: Allow anyone with public ID to check appeal status (anonymously)

**Implementation**:
```typescript
// app/appeals/track/route.ts - New public route
export async function POST(request: NextRequest) {
  const { publicId } = await request.json();
  
  const appeal = await prisma.userAppeal.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      type: true,
      status: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      messageCount: true,
    },
  });

  if (!appeal) {
    return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
  }

  return NextResponse.json(appeal);
}
```

**Pages to Create**:
- `app/track/page.tsx` - Public tracking interface
- `app/track/[publicId]/page.tsx` - Appeal details (public)

**UI Features**:
- Simple search by public ID
- Display appeal type, status, dates
- No login required
- Real-time status updates

**Estimated Time**: 6-8 hours

**Security**: Only show status, not sensitive details

---

### 3. Email Notifications with Public IDs

**Objective**: Include public ID in all appeal-related emails

**Implementation**:
```typescript
// lib/email-templates/appeal.ts
export function generateAppealEmail(appeal: Appeal) {
  return `
    <h2>Your Appeal #${formatAppealId(appeal.publicId)}</h2>
    <p>Status: ${appeal.status}</p>
    <p>Track your appeal: https://myunion.pro/track/${appeal.publicId}</p>
    
    <div style="background: #f5f5f5; padding: 10px;">
      <strong>Important:</strong> Save your appeal number: #${appeal.publicId}
    </div>
  `;
}
```

**Email Types**:
1. Appeal created confirmation
2. Status changed notification
3. New message in appeal
4. Appeal resolved notification
5. Appeal rejected notification

**Estimated Time**: 4-5 hours

**Files to Create/Modify**:
- `lib/email-templates/appeal.ts` (UPDATE)
- `app/api/appeals/route.ts` (UPDATE - send email on create)
- `app/api/appeals/[id]/route.ts` (UPDATE - send email on update)

---

## Phase 2: Core Features (2-3 sprints)

### 4. Custom ID Prefixes

**Objective**: Support organization-specific ID prefixes (ORG-12345678)

**Database Schema**:
```prisma
model Organization {
  // ... existing fields
  appealIdPrefix String @unique @db.Char(3) // e.g., "ORG"
  appealIdCounter Int @default(0)
}

model UserAppeal {
  // ... existing fields
  publicId String @unique // Format: "ORG-12345678"
  prefix String // "ORG"
  counter Int // Unique per org
}
```

**Implementation**:
```typescript
export async function generateAppealPublicIdWithPrefix(
  organizationId: string
): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!org?.appealIdPrefix) {
    throw new Error("Organization has no appeal ID prefix");
  }

  const counter = org.appealIdCounter + 1;
  const numPart = generateAppealPublicId().slice(0, 8);
  
  await prisma.organization.update({
    where: { id: organizationId },
    data: { appealIdCounter: counter },
  });

  return `${org.appealIdPrefix}-${numPart}`;
}
```

**UI Updates**:
- Show prefix in sidebar
- Display full ID format everywhere
- Filter appeals by prefix

**Estimated Time**: 8-10 hours

---

### 5. Appeal Categories & Tags

**Objective**: Improved categorization for better filtering and routing

**Database**:
```prisma
model AppealCategory {
  id String @id @default(cuid())
  name String
  description String?
  organizationId String?
  appeals UserAppeal[]
}

model UserAppeal {
  // ... existing fields
  categoryId String?
  category AppealCategory? @relation(fields: [categoryId])
  tags String[] // JSON array
}
```

**Features**:
- Custom categories per organization
- Tag-based filtering
- Smart routing based on category
- Category-specific SLAs

**Estimated Time**: 6-8 hours

---

### 6. Appeal Assignment & Workflow

**Objective**: Route appeals to appropriate staff members

**Database**:
```prisma
model AppealAssignment {
  id String @id @default(cuid())
  appealId String
  appeal UserAppeal @relation(fields: [appealId])
  assignedTo String // User ID
  assignedBy String // User ID
  status String // "assigned", "in_progress", "completed"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Features**:
- Assign appeals to staff
- Workflow stages (submitted → assigned → in_progress → resolved)
- SLA tracking
- Priority levels

**Estimated Time**: 10-12 hours

---

## Phase 3: Advanced Features (3-4 sprints)

### 7. Appeal Analytics Dashboard

**Objective**: Comprehensive analytics for appeals

**Metrics**:
- Total appeals by type
- Resolution rate by category
- Average resolution time
- Peak times
- Satisfaction scores

**Implementation**:
```typescript
// app/api/admin/analytics/appeals/route.ts
export async function GET(request: NextRequest) {
  const analytics = await prisma.userAppeal.groupBy({
    by: ["type", "status"],
    _count: true,
    _avg: { resolutionTime: true },
  });

  return NextResponse.json({ analytics });
}
```

**Admin Dashboard**:
- Charts and graphs
- Export to CSV/PDF
- Date range filtering
- Drill-down capability

**Estimated Time**: 12-15 hours

---

### 8. Appeal Escalation & SLA Management

**Objective**: Automatically escalate overdue appeals

**Database**:
```prisma
model AppealSLA {
  id String @id @default(cuid())
  type AppealType
  responseTime Int // hours
  resolutionTime Int // hours
}

model AppealEscalation {
  id String @id @default(cuid())
  appealId String
  appeal UserAppeal @relation(fields: [appealId])
  level Int // 1, 2, 3
  escalatedAt DateTime
  escalatedTo String // User ID
}
```

**Features**:
- Automatic escalation based on SLA
- Email notifications
- Dashboard alerts
- Historical tracking

**Estimated Time**: 10-12 hours

---

### 9. Appeal Comments & Discussion Thread

**Objective**: Enable communication within appeals

**Database**:
```prisma
model AppealComment {
  id String @id @default(cuid())
  appealId String
  appeal UserAppeal @relation(fields: [appealId])
  userId String
  user User @relation(fields: [userId])
  content String @db.Text
  attachments String[] // File URLs
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Features**:
- User & staff comments
- File attachments
- Real-time updates (WebSocket)
- Email notifications
- Comment history & edits

**Estimated Time**: 12-14 hours

---

### 10. Mobile App Integration

**Objective**: Dedicated mobile experience for appeal tracking

**Features**:
- Native iOS/Android apps
- Push notifications
- Offline appeal list
- Biometric login
- QR code scanner

**Technology**:
- React Native or Flutter
- REST API integration
- Push notifications (OneSignal)

**Estimated Time**: 40-50 hours

---

## Phase 4: Enterprise Features (4+ sprints)

### 11. Multi-Language Appeal Support

**Objective**: Support appeals in multiple languages

**Implementation**:
```typescript
model UserAppeal {
  // ... existing fields
  language String @default("ru") // "ru", "en", "de", etc.
  translatedTitle String? // Automated translation
  translatedDescription String?
}
```

**Features**:
- Auto-translation via API
- Manual translation by staff
- Language detection
- Multi-language search

---

### 12. Integration with External Systems

**Objective**: Connect appeals to external ticketing/CRM systems

**Integration Points**:
- Jira for project management
- Zendesk for support ticketing
- Salesforce for CRM
- Slack for notifications
- Teams for collaboration

**Implementation**:
```typescript
model IntegrationConfig {
  id String @id @default(cuid())
  type String // "jira", "zendesk", "slack"
  organizationId String
  config Json // Provider-specific config
}

// Auto-create tickets in external systems
export async function syncAppealToExternal(appeal: UserAppeal) {
  const configs = await prisma.integrationConfig.findMany({
    where: { organizationId: appeal.organizationId },
  });

  for (const config of configs) {
    await externalSync[config.type](appeal, config);
  }
}
```

---

## Implementation Priority Matrix

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| QR Codes | Low | Medium | P1 |
| Public Tracking | Low | High | P1 |
| Email Notifications | Low | High | P1 |
| Custom Prefixes | Medium | Medium | P2 |
| Categories & Tags | Medium | High | P2 |
| Assignment Workflow | High | High | P2 |
| Analytics Dashboard | High | High | P3 |
| SLA Management | High | High | P3 |
| Comments Thread | Medium | Medium | P3 |
| Mobile App | Very High | High | P4 |
| Multi-Language | Medium | Medium | P4 |
| External Integration | High | High | P4 |

---

## Quick Implementation Checklist

### For QR Codes
- [ ] Install `qrcode` package: `npm install qrcode`
- [ ] Create `lib/appeal-qr.ts`
- [ ] Add QR code component to appeal page
- [ ] Add download/print functionality
- [ ] Update email templates

### For Public Tracking
- [ ] Create public route `/track`
- [ ] Implement public API endpoint
- [ ] Build tracking page UI
- [ ] Add security (rate limiting)
- [ ] Test anonymously

### For Email Notifications
- [ ] Update email templates with public ID
- [ ] Add trigger on appeal creation
- [ ] Add trigger on status change
- [ ] Test email delivery
- [ ] Verify formatting

---

## Development Guidelines

1. **Each feature should include**:
   - Unit tests
   - Integration tests
   - API documentation
   - UI/UX mockups
   - Database migration

2. **Code review checklist**:
   - [ ] Follows TypeScript strict mode
   - [ ] Includes error handling
   - [ ] Has proper logging
   - [ ] Is documented
   - [ ] Tests pass
   - [ ] No security issues

3. **Database changes**:
   - [ ] Create Prisma migration
   - [ ] Test on staging
   - [ ] Measure performance
   - [ ] Plan rollback

4. **API changes**:
   - [ ] Document endpoint
   - [ ] Add rate limiting
   - [ ] Implement pagination
   - [ ] Add authentication checks

---

## Getting Started

Choose one Phase 1 feature to start:

1. **QR Codes** - Best for visual appeal
2. **Public Tracking** - Best for user experience
3. **Email Notifications** - Best for communication

Each can be completed in 1 sprint independently!

---

**Last Updated**: 2024-01-15
**Next Review**: 2024-02-15

