/**
 * Migrate chat attachments to Matrix
 * This script uploads files from local storage to Matrix and sends them as messages
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const MATRIX_SERVER = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

interface Attachment {
  id: string;
  messageId: string;
  type: string;
  fileName: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  message: {
    id: string;
    chatId: string;
    senderId: string;
    createdAt: Date;
    content: string;
    chat: {
      matrixRoomId: string | null;
    };
    sender: {
      matrixUserId: string | null;
      matrixAccessToken: string | null;
    };
  };
}

async function uploadFileToMatrix(
  filePath: string,
  mimeType: string,
  accessToken: string
): Promise<string | null> {
  const fullPath = path.join('/opt/my-union-pro/public', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`  File not found: ${fullPath}`);
    return null;
  }
  
  const fileBuffer = fs.readFileSync(fullPath);
  const fileName = path.basename(filePath);
  
  const response = await fetch(
    `${MATRIX_SERVER}/_matrix/media/v3/upload?filename=${encodeURIComponent(fileName)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: fileBuffer,
    }
  );
  
  if (!response.ok) {
    console.log(`  Upload failed: ${response.status}`);
    return null;
  }
  
  const data = await response.json() as { content_uri: string };
  return data.content_uri;
}

async function sendMatrixAttachment(
  roomId: string,
  contentUri: string,
  attachment: Attachment,
  accessToken: string
): Promise<boolean> {
  let msgtype = 'm.file';
  if (attachment.type === 'image' || attachment.mimeType.startsWith('image/')) {
    msgtype = 'm.image';
  } else if (attachment.mimeType.startsWith('video/')) {
    msgtype = 'm.video';
  } else if (attachment.mimeType.startsWith('audio/')) {
    msgtype = 'm.audio';
  }
  
  const txnId = `migrate_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  const response = await fetch(
    `${MATRIX_SERVER}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msgtype,
        body: attachment.originalName || attachment.fileName,
        url: contentUri,
        info: {
          mimetype: attachment.mimeType,
          size: attachment.fileSize,
        },
      }),
    }
  );
  
  return response.ok;
}

async function main() {
  console.log('🔄 Migrating attachments to Matrix...\n');
  
  // Get all attachments from messages that have a Matrix room
  const attachments = await prisma.chatMessageAttachment.findMany({
    where: {
      message: {
        chat: {
          matrixRoomId: { not: null }
        }
      }
    },
    include: {
      message: {
        include: {
          chat: {
            select: { matrixRoomId: true }
          },
          sender: {
            select: { 
              matrixUserId: true, 
              matrixAccessToken: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  }) as unknown as Attachment[];
  
  console.log(`Found ${attachments.length} attachments to migrate\n`);
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const attachment of attachments) {
    const roomId = attachment.message.chat.matrixRoomId;
    const sender = attachment.message.sender;
    
    if (!roomId || !sender.matrixAccessToken) {
      console.log(`⏭ Skipping ${attachment.originalName}: no room or token`);
      skipped++;
      continue;
    }
    
    console.log(`📎 ${attachment.originalName} (${attachment.type})`);
    
    try {
      // Upload file to Matrix
      const contentUri = await uploadFileToMatrix(
        attachment.filePath,
        attachment.mimeType,
        sender.matrixAccessToken
      );
      
      if (!contentUri) {
        failed++;
        continue;
      }
      
      console.log(`  ✓ Uploaded: ${contentUri}`);
      
      // Send as message
      const sent = await sendMatrixAttachment(
        roomId,
        contentUri,
        attachment,
        sender.matrixAccessToken
      );
      
      if (sent) {
        console.log(`  ✓ Sent to room`);
        success++;
      } else {
        console.log(`  ✗ Failed to send`);
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error: any) {
      console.log(`  ✗ Error: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  ✓ Success: ${success}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  ⏭ Skipped: ${skipped}`);
  console.log(`  Total: ${attachments.length}`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch(console.error);
