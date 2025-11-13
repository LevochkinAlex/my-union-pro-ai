# Document Generation Troubleshooting Guide

## Problem: "Documents generated successfully" not appearing

### Root Cause

Documents are only generated when **all required profile fields are complete**:

```
✅ Required fields (all must be filled):
- firstName (Имя)
- lastName (Фамилия)
- dateOfBirth (Дата рождения)
- phone (Телефон)
- address (Адрес)
- jobTitle (Должность)
- profession (Профессия)
- education (Образование)
```

If ANY field is missing, documents won't be generated and you'll see:
```
Profile not yet complete
```

---

## Solution 1: Fill Profile via Chat (Recommended)

The AI bot should collect all this information through conversation:

```
Bot: "Как я могу к вам обращаться? Назовите, пожалуйста, ваши фамилию, имя и отчество."
User: "Иванов Иван Иванович"

Bot: "Спасибо! Когда вы родились?"
User: "15 марта 1985"

Bot: "Ваш номер телефона?"
User: "+7 (800) 555-35-35"

... и так далее для каждого поля
```

**Expected**: After all data is collected, bot adds `[PROFILE_COMPLETE]` marker → documents generate → "Documents generated successfully" appears

---

## Solution 2: Fill Profile via API Endpoint

For **development/testing only**:

```bash
# Fill profile with test data
curl -X POST http://localhost:3004/api/debug/fill-profile \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "message": "Profile filled with test data",
  "user": {
    "id": "...",
    "firstName": "Иван",
    "lastName": "Иванов",
    ...
  }
}
```

Then send a message in chat → bot should recognize profile is complete → documents generate

---

## Solution 3: Generate Documents Directly

For **testing/debugging**, generate documents directly:

```bash
# First, get the user ID from browser console or database
# Then run:

node scripts/generate-test-documents.mjs <USER_ID>
```

**Example**:
```bash
node scripts/generate-test-documents.mjs clh123abc456def789xyz
```

**Output**:
```
📋 Generating documents for user: clh123abc456def789xyz
👤 User: Иван Иванов

📝 Filling profile with test data...
✅ Profile updated!

📄 Generating documents...
✅ Documents generated!
  - Membership: /tmp/membership_clh123abc456def789xyz.pdf
  - Contributions: /tmp/contributions_clh123abc456def789xyz.pdf

💾 Saving documents to database...
✅ Documents saved!

✨ Success! Documents are ready:
  1. Membership Application
  2. Contribution Application
```

---

## Debugging Steps

### 1. Check Browser Console

Open DevTools (F12) → Console tab → Look for logs:

```
✅ Good: "Documents generated successfully"
❌ Bad: "Profile not yet complete"
```

### 2. Check Server Logs

Look for these logs:

```
[chat] Profile completeness check: {
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  phone: true,
  address: true,
  jobTitle: true,
  profession: true,
  education: true,
  isComplete: true  ← Must be true
}
[chat] Adding [PROFILE_COMPLETE] marker to response
```

If `isComplete: false`, check which fields are missing.

### 3. Check Database

```bash
# Connect to database
psql $DATABASE_URL

# Check user profile
SELECT 
  id, 
  "firstName", 
  "lastName",
  "dateOfBirth",
  phone,
  address,
  "jobTitle",
  profession,
  education
FROM "User" 
WHERE id = 'YOUR_USER_ID';
```

### 4. Check Documents in Database

```bash
# List user's documents
SELECT id, type, status, "fileName"
FROM "Document"
WHERE "userId" = 'YOUR_USER_ID';
```

---

## Common Issues

### Issue 1: "Profile not yet complete" in console

**Cause**: One or more profile fields are empty

**Solution**:
1. Continue chatting with bot to provide missing information
2. OR use `/api/debug/fill-profile` to fill test data
3. OR use `node scripts/generate-test-documents.mjs` to auto-fill

### Issue 2: `[PROFILE_COMPLETE]` not appearing in chat

**Cause**: Profile fields still not all filled

**Solution**: 
1. Check server logs for which fields are missing
2. Provide that information to the bot
3. Send another message to trigger profile check

### Issue 3: "Failed to load resource: 400 Bad Request" on `/api/chat/extract-profile`

**Cause**: No `[PROFILE_COMPLETE]` marker in messages

**Solution**:
1. Don't call `/api/chat/extract-profile` manually
2. Wait for the bot to add `[PROFILE_COMPLETE]` marker
3. Click "Download Documents" button to trigger generation

### Issue 4: Documents created but not visible in Documents page

**Cause**: Page needs to refresh

**Solution**: 
1. Go to `/dashboard/documents`
2. Refresh page (F5)
3. Documents should appear

---

## Expected Flow

```
1. User chats with bot
   ↓
2. Bot asks questions and collects all profile data
   ↓
3. Bot recognizes profile is complete
   ↓
4. AI response includes [PROFILE_COMPLETE] marker
   ↓
5. Frontend calls /api/chat/extract-profile
   ↓
6. Endpoint validates profile completeness
   ↓
7. Endpoint calls generateMembershipApplication()
   ↓
8. Endpoint calls generateContributionsApplication()
   ↓
9. Documents saved to database
   ↓
10. Frontend shows "Documents generated successfully" button
    ↓
11. User can download/view documents
```

---

## Testing Profile Completeness

### Quick Test (Development Only)

```javascript
// In browser console:
const res = await fetch('/api/debug/fill-profile', {
  method: 'POST',
  credentials: 'include',
});
const data = await res.json();
console.log(data);
// Then send a message in chat
```

### Test Document Generation

```bash
# Get current user ID from browser or database
USER_ID="clh123..."

# Generate documents
node scripts/generate-test-documents.mjs $USER_ID

# Verify in database
psql $DATABASE_URL -c "SELECT * FROM \"Document\" WHERE \"userId\" = '$USER_ID';"
```

---

## Expected Result

✅ **You should see**:
- Two documents in the database (Membership + Contributions)
- "Documents generated successfully" message in browser console
- Files appear in `/dashboard/documents`
- Download buttons work for each document

---

## Related Files

- `app/api/chat/route.ts` - Profile completeness check
- `app/api/chat/extract-profile/route.ts` - Document generation trigger
- `lib/documents.ts` - PDF generation
- `app/api/debug/fill-profile/route.ts` - Test profile filler
- `scripts/generate-test-documents.mjs` - Direct generation script

---

## Support

If documents still aren't generating:

1. ✅ Check all profile fields are filled
2. ✅ Check server logs for profile completeness
3. ✅ Check console for `[PROFILE_COMPLETE]` marker
4. ✅ Use debug scripts to manually fill profile
5. ✅ Regenerate documents directly with script

Still having issues? Check the generated PDF files exist:

```bash
ls -la /tmp/*membership*.pdf /tmp/*contributions*.pdf 2>/dev/null
```

Files should exist if generation was successful.

---

**Last Updated**: 2024-01-15

