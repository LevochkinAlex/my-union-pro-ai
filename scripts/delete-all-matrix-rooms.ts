/**
 * Script to delete all Matrix rooms from the server
 * This will permanently remove all chat history from Matrix
 */

import 'dotenv/config';

const MATRIX_SERVER_URL = process.env.MATRIX_SERVER_URL || 'https://matrix.myunion.pro';
const MATRIX_ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;

if (!MATRIX_ADMIN_TOKEN) {
  console.error('❌ MATRIX_ADMIN_TOKEN is not set in environment variables');
  process.exit(1);
}

interface MatrixRoom {
  room_id: string;
  name?: string;
  canonical_alias?: string;
  joined_members: number;
  joined_local_members: number;
  version: string;
  creator: string;
}

interface RoomsListResponse {
  rooms: MatrixRoom[];
  offset: number;
  total_rooms: number;
  next_batch?: string;
  prev_batch?: string;
}

async function adminFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${MATRIX_SERVER_URL}${endpoint}`;
  console.log(`📡 Fetching: ${url}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MATRIX_ADMIN_TOKEN}`,
      ...options.headers,
    },
  });
  
  return response;
}

async function getAllRooms(): Promise<MatrixRoom[]> {
  console.log('\n🔍 Fetching all rooms from Matrix server...');
  
  const allRooms: MatrixRoom[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
    const response = await adminFetch(
      `/_synapse/admin/v1/rooms?from=${offset}&limit=${limit}`
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch rooms: ${response.status} ${errorText}`);
    }
    
    const data = await response.json() as RoomsListResponse;
    allRooms.push(...data.rooms);
    
    console.log(`  ✓ Fetched ${data.rooms.length} rooms (total so far: ${allRooms.length}/${data.total_rooms})`);
    
    offset += limit;
    hasMore = data.next_batch !== undefined && allRooms.length < data.total_rooms;
  }
  
  console.log(`\n📊 Found ${allRooms.length} total rooms`);
  return allRooms;
}

async function deleteRoom(roomId: string, roomName?: string): Promise<boolean> {
  try {
    console.log(`  🗑️  Deleting: ${roomId} ${roomName ? `(${roomName})` : ''}`);
    
    const response = await adminFetch(
      `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          block: false, // Don't block the room
          purge: true,  // Purge all history
        }),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ❌ Failed to delete ${roomId}: ${response.status} ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`  ✅ Deleted: ${roomId} (delete_id: ${result.delete_id || 'N/A'})`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error deleting ${roomId}:`, error);
    return false;
  }
}

async function deleteAllRooms(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        DELETE ALL MATRIX ROOMS SCRIPT                     ║');
  console.log('║        ⚠️  WARNING: This will delete ALL chat history!    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Get all rooms
    const rooms = await getAllRooms();
    
    if (rooms.length === 0) {
      console.log('\n✅ No rooms found. Matrix is already clean!');
      return;
    }
    
    console.log(`\n🗑️  Starting deletion of ${rooms.length} rooms...\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Delete each room
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      console.log(`[${i + 1}/${rooms.length}]`);
      
      const success = await deleteRoom(room.room_id, room.name || room.canonical_alias);
      
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   DELETION COMPLETE                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Successfully deleted: ${successCount} rooms`);
    console.log(`❌ Failed to delete: ${failCount} rooms`);
    console.log(`📊 Total processed: ${rooms.length} rooms`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
deleteAllRooms()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
