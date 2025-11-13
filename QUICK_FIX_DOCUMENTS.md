# ⚡ Quick Fix: Generate Documents Now

## Problem
Documents are not generating - showing "Profile not yet complete"

## Solution (3 ways - pick one)

### Way 1️⃣: Fill Profile via API (Quickest)

```bash
# Terminal: Get your user ID from database or browser
psql $DATABASE_URL -c "SELECT id, email FROM \"User\" ORDER BY \"createdAt\" DESC LIMIT 1;"
# Copy the id (looks like: clh123abc...)

# Export it
export USER_ID="clh123abc..."

# Auto-fill profile
curl -X POST http://localhost:3004/api/debug/fill-profile \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=$(node -e 'console.log(process.env.SESSION_TOKEN || "")')"

# Then in browser: Send ANY message in chat → Documents should generate ✅
```

### Way 2️⃣: Generate Directly (For Testing)

```bash
# Terminal: Get user ID
export USER_ID="clh123abc..."

# Generate documents now
node scripts/generate-test-documents.mjs $USER_ID
```

Output:
```
✅ Profile updated!
✅ Documents generated!
✅ Documents saved!
✨ Success! Documents are ready:
  1. Membership Application
  2. Contribution Application
```

✅ Done! Check `/dashboard/documents`

### Way 3️⃣: Continue Chat (Proper way)

The bot needs to collect all fields:
- ✅ Name (Фамилия Имя Отчество)
- ✅ Birth date (Дата рождения)
- ✅ Phone (Телефон)
- ✅ Address (Адрес)
- ✅ Job title (Должность)
- ✅ Profession (Профессия)
- ✅ Education (Образование)

Make sure the bot gets ALL of them, then it will auto-generate documents.

---

## ✅ Verification

After applying fix, check:

1. **Browser Console** (F12 → Console):
   ```
   ✅ "Documents generated successfully"
   ```

2. **Database**:
   ```bash
   psql $DATABASE_URL -c "SELECT type, \"fileName\" FROM \"Document\" WHERE \"userId\" = '$USER_ID';"
   ```
   Should show 2 documents

3. **Dashboard**:
   - Go to `/dashboard/documents`
   - Should see 2 applications ready to download

---

## 📝 Server Logs to Check

```
[chat] Profile completeness check: {
  firstName: true,     ← All must be true
  lastName: true,
  dateOfBirth: true,
  phone: true,
  address: true,
  jobTitle: true,
  profession: true,
  education: true,
  isComplete: true
}
[chat] Adding [PROFILE_COMPLETE] marker to response
```

If any field is `false`, user needs to provide that data to bot.

---

## 🔧 Still Not Working?

### 1. Check profile is really filled

```bash
psql $DATABASE_URL
SELECT "firstName", "lastName", "dateOfBirth", phone, address, "jobTitle", profession, education
FROM "User" WHERE id = '$USER_ID';
```

All fields must have values (not NULL)

### 2. Check documents were created

```bash
SELECT id, type, status, "fileName" FROM "Document" WHERE "userId" = '$USER_ID';
```

Should show 2 rows

### 3. Check PDF files exist

```bash
ls -la /tmp/*membership*.pdf /tmp/*contributions*.pdf
```

### 4. Clear browser cache

- Press `Ctrl+Shift+Delete` (or Cmd+Shift+Delete on Mac)
- Clear cache, cookies
- Reload page

---

## 📊 What Happens Behind the Scenes

```
User fills all profile fields
       ↓
AI recognizes profile complete
       ↓
Adds [PROFILE_COMPLETE] marker
       ↓
Frontend sends request to /api/chat/extract-profile
       ↓
Backend validates all fields exist
       ↓
Backend calls PDF generation
       ↓
2 PDF files created
       ↓
2 records saved to Document table
       ↓
Frontend shows "Documents generated successfully" ✅
```

---

## 🎯 Expected Result

After following any of the 3 ways, you should have:

✅ 2 documents in database
✅ 2 PDF files on disk
✅ Download buttons visible in `/dashboard/documents`
✅ "Documents generated successfully" in console

---

🚀 **Pick any method above and documents should generate!**

For more details, see: `DOCUMENT_GENERATION_TROUBLESHOOTING.md`

