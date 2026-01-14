/**
 * Script to migrate ticket attachments to Matrix
 * This uploads files from TicketAttachment to Matrix and sends them as messages
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const MATRIX_SERVER = process.env.MATRIX_HOMESERVER_URL || 'https://matrix.myunion.pro';
const ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;

async function matrixFetch(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${MATRIX_SERVER}/_matrix/client/v3${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
      ...options.headers,
    },
  });
  return response;
}

async function uploadFileToMatrix(filePath: string, mimeType: string, fileName: string, accessToken: string) {
  // Read file
  const absolutePath = path.join(process.cwd(), 'public', filePath.replace(/^\//, ''));
  
  if (!fs.existsSync(absolutePath)) {
    console.log(`  File not found: ${absolutePath}`);
    return null;
  }
  
  const fileBuffer = fs.readFileSync(absolutePath);
  
  // Upload to Matrix media endpoint (v1 for authenticated uploads)
  const response = await fetch(`${MATRIX_SERVER}/_matrix/media/v3/upload?filename=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': mimeType,
    },
    body: fileBuffer,
  });
  
  if (!response.ok) {
    console.log(`  Failed to upload: ${await response.text()}`);
    return null;
  }
  
  const data = await response.json();
  return data.content_uri;
}

async function sendFileMessage(roomId: string, accessToken: string, contentUri: string, fileName: string, mimeType: string, fileSize: number) {
  // Determine message type
  let msgtype = 'm.file';
  if (mimeType.startsWith('image/')) msgtype = 'm.image';
  else if (mimeType.startsWith('video/')) msgtype = 'm.video';
  else if (mimeType.startsWith('audio/')) msgtype = 'm.audio';
  
  const txnId = `migrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const response = await fetch(`${MATRIX_SERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msgtype,
      body: fileName,
      url: contentUri,
      info: {
        mimetype: mimeType,
        size: fileSize,
      },
    }),
  });
  
  return response.ok;
}

async function main() {
  console.log('Starting ticket attachment migration to Matrix...\n');
  
  // Get all tickets with attachments and matrix room
  const tickets = await prisma.ticket.findMany({
    where: {
      chat: {
        matrixRoomId: { not: null },
      },
      attachments: {
        some: {},
      },
    },
    include: {
      attachments: true,
      chat: {
        select: {
          matrixRoomId: true,
        },
      },
      user: {
        select: {
          id: true,
          matrixUserId: true,
          matrixAccessToken: true,
        },
      },
    },
  });
  
  console.log(`Found ${tickets.length} tickets with attachments\n`);
  
  let migratedCount = 0;
  let failedCount = 0;
  
  for (const ticket of tickets) {
    console.log(`\nProcessing ticket #${ticket.publicId} (${ticket.attachments.length} attachments)`);
    
    const matrixRoomId = ticket.chat?.matrixRoomId;
    const accessToken = ticket.user?.matrixAccessToken;
    
    if (!matrixRoomId || !accessToken) {
      console.log(`  Skipping - no Matrix room or user token`);
      continue;
    }
    
    for (const attachment of ticket.attachments) {
      console.log(`  Migrating: ${attachment.fileName}`);
      
      // Upload to Matrix
      const contentUri = await uploadFileToMatrix(
        attachment.filePath,
        attachment.mimeType,
        attachment.fileName,
        accessToken
      );
      
      if (!contentUri) {
        failedCount++;
        continue;
      }
      
      // Send as message
      const success = await sendFileMessage(
        matrixRoomId,
        accessToken,
        contentUri,
        attachment.fileName,
        attachment.mimeType,
        attachment.fileSize
      );
      
      if (success) {
        console.log(`  ✓ Migrated: ${attachment.fileName}`);
        migratedCount++;
      } else {
        console.log(`  ✗ Failed to send message for: ${attachment.fileName}`);
        failedCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  console.log(`\n========================================`);
  console.log(`Migration complete!`);
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Failed: ${failedCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
