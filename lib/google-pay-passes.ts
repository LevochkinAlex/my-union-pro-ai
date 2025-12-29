/**
 * Утилита для работы с Google Pay Passes API
 * Использует существующий Service Account из Firebase
 */

import { JWT } from 'google-auth-library';
import jwt from 'jsonwebtoken';

// Конфигурация из переменных окружения
const ISSUER_ID = process.env.GOOGLE_PAY_ISSUER_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_PAY_SERVICE_ACCOUNT_EMAIL || 
  'firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com';
const PROJECT_ID = process.env.GOOGLE_PAY_PROJECT_ID || 'myunion-c3187';

// Service Account credentials из Firebase Admin
const getServiceAccountCredentials = () => {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (!privateKey) {
    throw new Error('FIREBASE_PRIVATE_KEY is not set');
  }

  return {
    type: 'service_account',
    project_id: PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || '003d6de79e46870304bf7afdad316cd108917912',
    private_key: privateKey,
    client_email: SERVICE_ACCOUNT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID || '112624239560749922366',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(SERVICE_ACCOUNT_EMAIL)}`,
    universe_domain: 'googleapis.com',
  };
};

/**
 * Создает JWT клиент для аутентификации в Google Pay API
 */
async function getJWTClient(): Promise<JWT> {
  const credentials = getServiceAccountCredentials();
  
  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
}

/**
 * Создает класс пропуска (Loyalty Class)
 */
export interface LoyaltyClassData {
  classId: string;
  issuerName: string;
  programName: string;
  programLogo?: {
    sourceUri: {
      uri: string;
    };
  };
}

export async function createLoyaltyClass(data: LoyaltyClassData): Promise<void> {
  if (!ISSUER_ID) {
    throw new Error('GOOGLE_PAY_ISSUER_ID is not set');
  }

  const jwtClient = await getJWTClient();
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass`;

  const loyaltyClass = {
    id: `${ISSUER_ID}.${data.classId}`,
    issuerName: data.issuerName,
    programName: data.programName,
    programLogo: data.programLogo,
    reviewStatus: 'UNDER_REVIEW',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await jwtClient.getAccessToken()}`,
      },
      body: JSON.stringify(loyaltyClass),
    });

    if (!response.ok) {
      const error = await response.text();
      // Если класс уже существует (409), это нормально
      if (response.status === 409) {
        console.log(`Loyalty class ${data.classId} already exists`);
        return;
      }
      throw new Error(`Failed to create loyalty class: ${error}`);
    }

    console.log(`✅ Loyalty class ${data.classId} created successfully`);
  } catch (error) {
    console.error('Error creating loyalty class:', error);
    throw error;
  }
}

/**
 * Создает объект пропуска (Loyalty Object)
 */
export interface LoyaltyObjectData {
  objectId: string;
  classId: string;
  accountName: string;
  accountId: string;
  discountTitle: string;
  promoCode?: string;
  validUntil?: string;
  imageUrl?: string;
}

export async function createLoyaltyObject(data: LoyaltyObjectData): Promise<string> {
  if (!ISSUER_ID) {
    throw new Error('GOOGLE_PAY_ISSUER_ID is not set');
  }

  const jwtClient = await getJWTClient();
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject`;

  const loyaltyObject: any = {
    id: `${ISSUER_ID}.${data.objectId}`,
    classId: `${ISSUER_ID}.${data.classId}`,
    state: 'ACTIVE',
    accountName: data.accountName,
    accountId: data.accountId,
    loyaltyPoints: {
      label: 'Скидка',
      balance: {
        string: data.discountTitle,
      },
    },
  };

  // Добавляем штрихкод/QR-код если есть промокод
  if (data.promoCode) {
    loyaltyObject.barcodes = [
      {
        type: 'QR_CODE',
        value: data.promoCode,
        alternateText: data.promoCode,
      },
    ];
  }

  // Добавляем срок действия
  if (data.validUntil) {
    loyaltyObject.validTimeInterval = {
      start: {
        date: new Date().toISOString().split('T')[0],
      },
      end: {
        date: new Date(data.validUntil).toISOString().split('T')[0],
      },
    };
  }

  // Добавляем изображение если есть
  if (data.imageUrl) {
    loyaltyObject.heroImage = {
      sourceUri: {
        uri: data.imageUrl,
      },
      contentDescription: {
        defaultValue: {
          language: 'ru-RU',
          value: data.discountTitle,
        },
      },
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await jwtClient.getAccessToken()}`,
      },
      body: JSON.stringify(loyaltyObject),
    });

    if (!response.ok) {
      const error = await response.text();
      // Если объект уже существует (409), обновляем его
      if (response.status === 409) {
        console.log(`Loyalty object ${data.objectId} already exists, updating...`);
        return await updateLoyaltyObject(data);
      }
      throw new Error(`Failed to create loyalty object: ${error}`);
    }

    const result = await response.json();
    console.log(`✅ Loyalty object ${data.objectId} created successfully`);
    return result.id;
  } catch (error) {
    console.error('Error creating loyalty object:', error);
    throw error;
  }
}

/**
 * Обновляет существующий объект пропуска
 */
async function updateLoyaltyObject(data: LoyaltyObjectData): Promise<string> {
  if (!ISSUER_ID) {
    throw new Error('GOOGLE_PAY_ISSUER_ID is not set');
  }

  const jwtClient = await getJWTClient();
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${ISSUER_ID}.${data.objectId}`;

  const loyaltyObject: any = {
    state: 'ACTIVE',
    accountName: data.accountName,
    accountId: data.accountId,
    loyaltyPoints: {
      label: 'Скидка',
      balance: {
        string: data.discountTitle,
      },
    },
  };

  if (data.promoCode) {
    loyaltyObject.barcodes = [
      {
        type: 'QR_CODE',
        value: data.promoCode,
        alternateText: data.promoCode,
      },
    ];
  }

  if (data.validUntil) {
    loyaltyObject.validTimeInterval = {
      start: {
        date: new Date().toISOString().split('T')[0],
      },
      end: {
        date: new Date(data.validUntil).toISOString().split('T')[0],
      },
    };
  }

  if (data.imageUrl) {
    loyaltyObject.heroImage = {
      sourceUri: {
        uri: data.imageUrl,
      },
      contentDescription: {
        defaultValue: {
          language: 'ru-RU',
          value: data.discountTitle,
        },
      },
    };
  }

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await jwtClient.getAccessToken()}`,
      },
      body: JSON.stringify(loyaltyObject),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update loyalty object: ${error}`);
    }

    const result = await response.json();
    console.log(`✅ Loyalty object ${data.objectId} updated successfully`);
    return result.id;
  } catch (error) {
    console.error('Error updating loyalty object:', error);
    throw error;
  }
}

/**
 * Генерирует JWT для добавления пропуска в Google Wallet
 */
export async function generateSaveJWT(
  classId: string,
  objectId: string
): Promise<string> {
  if (!ISSUER_ID) {
    throw new Error('GOOGLE_PAY_ISSUER_ID is not set');
  }

  const jwtClient = await getJWTClient();
  
  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    aud: 'google',
    origins: [process.env.NEXT_PUBLIC_APP_URL || 'https://myunion.pro'],
    typ: 'savetowallet',
    payload: {
      loyaltyObjects: [
        {
          id: `${ISSUER_ID}.${objectId}`,
        },
      ],
    },
  };

  // Используем jsonwebtoken для подписи кастомного JWT
  const credentials = getServiceAccountCredentials();
  
  const token = jwt.sign(payload, credentials.private_key, {
    algorithm: 'RS256',
    expiresIn: '1h',
  });
  
  return token;
}

/**
 * Создает полный пропуск (класс + объект) и возвращает JWT для добавления
 */
export async function createDiscountPass(
  discountId: number,
  discountTitle: string,
  userId: string,
  userName: string,
  promoCode?: string,
  validUntil?: string,
  imageUrl?: string
): Promise<{ saveUrl: string; jwt: string }> {
  try {
    // Создаем или получаем класс пропуска
    const classId = `discount_class_${discountId}`;
    await createLoyaltyClass({
      classId,
      issuerName: 'MyUnion Pro',
      programName: 'Скидки и льготы',
      programLogo: {
        sourceUri: {
          uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://myunion.pro'}/logo.png`,
        },
      },
    });

    // Создаем объект пропуска
    const objectId = `discount_${discountId}_${userId}`;
    await createLoyaltyObject({
      objectId,
      classId,
      accountName: userName,
      accountId: userId,
      discountTitle,
      promoCode,
      validUntil,
      imageUrl,
    });

    // Генерируем JWT для добавления
    const jwt = await generateSaveJWT(classId, objectId);
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

    return { saveUrl, jwt };
  } catch (error) {
    console.error('Error creating discount pass:', error);
    throw error;
  }
}

