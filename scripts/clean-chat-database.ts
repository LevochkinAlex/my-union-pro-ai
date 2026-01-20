/**
 * Script to clean up chat-related data from the database
 * This removes all old chat data that was using Matrix
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanChatDatabase() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        CLEAN CHAT DATABASE SCRIPT                         ║');
  console.log('║        Removing all old chat-related data                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Delete chat messages
    console.log('🗑️  Deleting chat messages...');
    const deletedMessages = await prisma.chatMessage.deleteMany({});
    console.log(`  ✅ Deleted ${deletedMessages.count} messages`);

    // Delete chat message attachments
    console.log('🗑️  Deleting message attachments...');
    const deletedAttachments = await prisma.chatMessageAttachment.deleteMany({});
    console.log(`  ✅ Deleted ${deletedAttachments.count} attachments`);

    // Delete chat message reactions
    console.log('🗑️  Deleting message reactions...');
    const deletedReactions = await prisma.chatMessageReaction.deleteMany({});
    console.log(`  ✅ Deleted ${deletedReactions.count} reactions`);

    // Delete chat message reads
    console.log('🗑️  Deleting message read receipts...');
    const deletedReads = await prisma.chatMessageRead.deleteMany({});
    console.log(`  ✅ Deleted ${deletedReads.count} read receipts`);

    // Delete chat participants
    console.log('🗑️  Deleting chat participants...');
    const deletedParticipants = await prisma.chatParticipant.deleteMany({});
    console.log(`  ✅ Deleted ${deletedParticipants.count} participants`);

    // Delete chats (except AI chats, we'll keep those for recreation)
    console.log('🗑️  Deleting chats...');
    const deletedChats = await prisma.chat.deleteMany({});
    console.log(`  ✅ Deleted ${deletedChats.count} chats`);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   CLEANUP COMPLETE                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n📊 Summary:`);
    console.log(`  • Messages: ${deletedMessages.count}`);
    console.log(`  • Attachments: ${deletedAttachments.count}`);
    console.log(`  • Reactions: ${deletedReactions.count}`);
    console.log(`  • Read receipts: ${deletedReads.count}`);
    console.log(`  • Participants: ${deletedParticipants.count}`);
    console.log(`  • Chats: ${deletedChats.count}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanChatDatabase()
  .then(() => {
    console.log('\n✅ Database cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Database cleanup failed:', error);
    process.exit(1);
  });
