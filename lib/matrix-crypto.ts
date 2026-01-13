/**
 * Matrix E2E Encryption Support
 * Uses Olm library for end-to-end encryption
 */

// Note: E2E encryption requires Olm WASM library to be loaded
// This is handled automatically by matrix-js-sdk when properly configured

import type * as sdk from 'matrix-js-sdk';

export interface CryptoConfig {
  deviceId: string;
  userId: string;
  accessToken: string;
}

/**
 * Initialize crypto for Matrix client
 * Must be called before starting the client
 */
export async function initCrypto(
  client: sdk.MatrixClient,
  config: CryptoConfig
): Promise<boolean> {
  try {
    // Check if crypto is supported
    if (!client.isCryptoEnabled()) {
      console.log('Crypto not enabled on client');
      return false;
    }

    // Initialize crypto store
    await client.initCrypto();
    
    // Set device verified (for testing - in production use proper verification)
    const deviceId = client.getDeviceId();
    if (deviceId) {
      await client.setDeviceKnown(config.userId, deviceId);
      await client.setDeviceVerified(config.userId, deviceId);
    }

    console.log('Crypto initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize crypto:', error);
    return false;
  }
}

/**
 * Enable E2E encryption for a room
 */
export async function enableRoomEncryption(
  client: sdk.MatrixClient,
  roomId: string
): Promise<boolean> {
  try {
    await client.sendStateEvent(roomId, 'm.room.encryption', {
      algorithm: 'm.megolm.v1.aes-sha2',
    });
    console.log(`Encryption enabled for room ${roomId}`);
    return true;
  } catch (error) {
    console.error('Failed to enable room encryption:', error);
    return false;
  }
}

/**
 * Check if room is encrypted
 */
export function isRoomEncrypted(
  client: sdk.MatrixClient,
  roomId: string
): boolean {
  const room = client.getRoom(roomId);
  if (!room) return false;
  
  const encryptionEvent = room.currentState.getStateEvents('m.room.encryption', '');
  return !!encryptionEvent;
}

/**
 * Verify user's device
 */
export async function verifyDevice(
  client: sdk.MatrixClient,
  userId: string,
  deviceId: string
): Promise<boolean> {
  try {
    await client.setDeviceKnown(userId, deviceId);
    await client.setDeviceVerified(userId, deviceId);
    console.log(`Device ${deviceId} verified for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Failed to verify device:', error);
    return false;
  }
}

/**
 * Get device list for user
 */
export async function getDevices(
  client: sdk.MatrixClient,
  userId: string
): Promise<Array<{ deviceId: string; displayName?: string; verified: boolean }>> {
  try {
    await client.downloadKeys([userId]);
    const devices = client.getStoredDevicesForUser(userId);
    
    return devices.map(device => ({
      deviceId: device.deviceId,
      displayName: device.getDisplayName(),
      verified: device.isVerified(),
    }));
  } catch (error) {
    console.error('Failed to get devices:', error);
    return [];
  }
}

/**
 * Export room keys for backup
 */
export async function exportRoomKeys(
  client: sdk.MatrixClient,
  passphrase: string
): Promise<string | null> {
  try {
    const keys = await client.exportRoomKeys();
    // In production, encrypt with passphrase
    return JSON.stringify(keys);
  } catch (error) {
    console.error('Failed to export room keys:', error);
    return null;
  }
}

/**
 * Import room keys from backup
 */
export async function importRoomKeys(
  client: sdk.MatrixClient,
  keysJson: string,
  _passphrase: string
): Promise<boolean> {
  try {
    const keys = JSON.parse(keysJson);
    await client.importRoomKeys(keys);
    console.log('Room keys imported successfully');
    return true;
  } catch (error) {
    console.error('Failed to import room keys:', error);
    return false;
  }
}
