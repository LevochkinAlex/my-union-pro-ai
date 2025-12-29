/**
 * Утилита для работы с Google Pay Passes API
 * Использует существующий Service Account из Firebase
 */

import { JWT } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';

// Конфигурация из переменных окружения
const ISSUER_ID = process.env.GOOGLE_PAY_ISSUER_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_PAY_SERVICE_ACCOUNT_EMAIL || 
  'firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com';
const PROJECT_ID = process.env.GOOGLE_PAY_PROJECT_ID || 'myunion-c3187';

// Service Account credentials из Firebase Admin (используем тот же подход с fallback)
const getServiceAccountCredentials = () => {
  // Используем тот же fallback ключ, что и в firebase-admin.ts
  const defaultPrivateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDJ9WyhJ6hrjDCa\nsH8HIvI/U/KCsTTYleS5TRXH5BfwzAEG/xGCpAQkK7KpopwML2C2zTX3aEiTqOvm\nlLTycwXK783hCIUVuo12yX7ZzeMonVq3Slc7+JWQbNQx/K7sm5s5sO6qZorfkkpj\n8GYOnNPU714415TJnPD/rAawgm9Q38OlO7LsDio1NbUoKLjnD8c/uN6zMRY8VXST\nNtuKpcPFc7CQgIHN3nhAvyEMWIPrC74U0HOjE+2sebDAdyVbotXNC2qqQSCKKmOn\npG35KZ/UaxA6RzI07L85ezafKQgdIQTm7+/gnywSQWfCGmUgj9jxlTn7qHH0q/RB\ntdnp36inAgMBAAECggEACKDPgS6qD3b/6DC/kV6VveauvWGnvqCsxgCvYqJYJkv4\n6t0aP09IwM8/602ZebXLRBQOIntJYOTLHnp4JPfzPxr+qNOndLWxiVBZ3VR7+3mG\nU77woIz7itEmqA1B34Ih+a8ZWANYgVO4Xn7gEiJZThQWt1P46DvBwHj15Wc1LUQt\nApN0T98Td3pl+oSj9+F0kvBctjfOnINP5w6iAKhrpMLhLKniiTSgvfRH29YIY3UE\nGra7Tk8JuBOIMqgu5OX5SM5oRqsbXpMr+8AvaGTLon7sXlmL+cYrTI8kEUeK6Q1l\nxOp2nxnrQZrJ63ql0kYqxkikV95nUz3j91wtZ3i10QKBgQDwHyvMGhQBENxxCfk9\ndSrv7sQ1fSWRQLEd0h+OgvFDmCng6dVm78Qcse0T8Vn9N7kpVEKk54NVjt9ddlg0\nuLRvdhLm1PVqJu6CsR6/0COAdCq/41MPxP0A3qCMyUhVOm9zRlsixSM9H1ix6CTy\nqgTwUSa3suQKiAbAxmL9AcoL0QKBgQDXUDieCcLG5xVavuvAMMh7ql0UpTTC/X7x\nHL+KBm6cLM02tYVHlngr5766/4UOhf2B3A/+29O9PFQSTQCwjbZ9o21EEiLUbw1h\nXidmS/gHwotWP6VyKfWpYxH6LLyvSJf7+G0NZ8xvEfSFZ5Sckxa0GoTjk20Yptca\nluCTjjSi9wKBgQCTIbZ3eJ87S/aXORJEiy/FFtuZHtbPGwGsER2O+EMXNPysOPuu\n+EmFf6ySJLgMRYGqhlvTqZw657GMFkDUBT1icsoAMQszgSlyYU9DHykxw3ySWZuC\ntSSFzOQ5f/hXaNfznW+obX07LaLuWB2Tp4QhMMh1lSLQJStmIelzuA3ykQKBgEJn\nZ062S+/0DM3z29lmMi6RmCtp2B/a9m9+IkR7P1nDJ3cb/ILbkSxZSKV7cJnOESUf\nrX84ZNET7gnG3dOVoRaWdHht73f81++TjisqetBJ25c6Adh3wGABQeYaLgcRKG55\na4ia3p3St8r86wRvCK17EEjvitHzgpuctJ5NWUZ5AoGBAJxOocs/41AQaC5FYU51\nJrtnYlLYRitV8nijRwXjZusQ29AL+iiBSZzP1trzc9OYsYLYn68/eKmaA4oSGO9k\nFhAbxdEZHXB40fm7NvZ680/iFhATEkWmhcKWUgugAbuxtfWpLIGHFxUEKi+zjgcP\ni88Omr88YcKqdSRTYcBU3+xq\n-----END PRIVATE KEY-----\n";
  
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || defaultPrivateKey;

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
  
  const jwtClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });

  // Проверяем, что можем получить токен
  try {
    const token = await jwtClient.getAccessToken();
    if (!token) {
      throw new Error('Failed to get access token');
    }
    console.log('[Google Wallet] ✅ Access token получен успешно');
  } catch (error: any) {
    console.error('[Google Wallet] ❌ Ошибка получения access token:', error.message);
    throw new Error(`Failed to authenticate: ${error.message}`);
  }
  
  return jwtClient;
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
    const accessToken = await jwtClient.getAccessToken();
    if (!accessToken) {
      throw new Error('Failed to get access token from JWT client');
    }

    console.log(`[Google Wallet] Creating loyalty class: ${data.classId}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
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
  cardImageDataUrl?: string; // Data URL сгенерированной карточки
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

  // Добавляем изображение карточки (приоритет: cardImageDataUrl > imageUrl)
  // Для Google Wallet лучше использовать cardImageDataUrl - это сгенерированная карточка
  if (data.cardImageDataUrl && data.cardImageDataUrl.startsWith('http')) {
    // Если это уже публичный URL
    loyaltyObject.heroImage = {
      sourceUri: {
        uri: data.cardImageDataUrl,
      },
      contentDescription: {
        defaultValue: {
          language: 'ru-RU',
          value: data.discountTitle,
        },
      },
    };
  } else if (data.imageUrl) {
    // Fallback на оригинальное изображение скидки
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

  // Добавляем текстовые модули для лучшего отображения информации
  loyaltyObject.textModulesData = [
    {
      header: 'Промокод',
      body: data.promoCode || 'Покажите эту карту',
      id: 'promo_code',
    },
    {
      header: 'Пользователь',
      body: data.accountName,
      id: 'user_name',
    },
  ];

  // Добавляем срок действия в текстовый модуль если есть
  if (data.validUntil) {
    loyaltyObject.textModulesData.push({
      header: 'Действует до',
      body: new Date(data.validUntil).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      id: 'valid_until',
    });
  }

  try {
    console.log('[createLoyaltyObject] Request URL:', url);
    console.log('[createLoyaltyObject] Request body keys:', Object.keys(loyaltyObject));

    const accessToken = await jwtClient.getAccessToken();
    console.log('[createLoyaltyObject] Access token obtained:', accessToken ? 'yes' : 'no');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(loyaltyObject),
    });

    console.log('[createLoyaltyObject] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const error = await response.text();
      console.error('[createLoyaltyObject] Error response:', error);
      // Если объект уже существует (409), обновляем его
      if (response.status === 409) {
        console.log(`[createLoyaltyObject] Loyalty object ${data.objectId} already exists, updating...`);
        return await updateLoyaltyObject(data);
      }
      throw new Error(`Failed to create loyalty object: ${response.status} ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    console.log(`[createLoyaltyObject] ✅ Loyalty object ${data.objectId} created successfully:`, result.id);
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

  if (data.cardImageDataUrl && data.cardImageDataUrl.startsWith('http')) {
    loyaltyObject.heroImage = {
      sourceUri: {
        uri: data.cardImageDataUrl,
      },
      contentDescription: {
        defaultValue: {
          language: 'ru-RU',
          value: data.discountTitle,
        },
      },
    };
  } else if (data.imageUrl) {
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

  // Добавляем текстовые модули
  loyaltyObject.textModulesData = [
    {
      header: 'Промокод',
      body: data.promoCode || 'Покажите эту карту',
      id: 'promo_code',
    },
    {
      header: 'Пользователь',
      body: data.accountName,
      id: 'user_name',
    },
  ];

  if (data.validUntil) {
    loyaltyObject.textModulesData.push({
      header: 'Действует до',
      body: new Date(data.validUntil).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      id: 'valid_until',
    });
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

  const credentials = getServiceAccountCredentials();
  const fullObjectId = `${ISSUER_ID}.${objectId}`;
  
  console.log('[generateSaveJWT] Generating JWT for:', {
    issuerId: ISSUER_ID,
    objectId: fullObjectId,
    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
  });
  
  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    aud: 'google',
    origins: [process.env.NEXT_PUBLIC_APP_URL || 'https://myunion.pro'],
    typ: 'savetowallet',
    payload: {
      loyaltyObjects: [
        {
          id: fullObjectId,
        },
      ],
    },
  };

  console.log('[generateSaveJWT] JWT payload:', {
    iss: payload.iss,
    aud: payload.aud,
    typ: payload.typ,
    objectId: fullObjectId,
    origins: payload.origins,
  });

  // Используем jsonwebtoken для подписи кастомного JWT
  try {
    const token = jwt.sign(payload, credentials.private_key, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
    
    console.log('[generateSaveJWT] JWT generated successfully, length:', token.length);
    return token;
  } catch (error) {
    console.error('[generateSaveJWT] Error signing JWT:', error);
    throw error;
  }
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
  imageUrl?: string,
  cardImageDataUrl?: string
): Promise<{ saveUrl: string; jwt: string }> {
  try {
    console.log('[createDiscountPass] Starting with:', {
      discountId,
      discountTitle,
      userId,
      userName,
      hasPromoCode: !!promoCode,
      validUntil,
      hasImageUrl: !!imageUrl,
      hasCardImageDataUrl: !!cardImageDataUrl,
    });

    // Создаем или получаем класс пропуска
    const classId = `discount_class_${discountId}`;
    console.log('[createDiscountPass] Creating loyalty class:', classId);
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
    console.log('[createDiscountPass] Loyalty class created/updated');

    // Создаем объект пропуска
    const objectId = `discount_${discountId}_${userId}`;
    console.log('[createDiscountPass] Creating loyalty object:', objectId);
    await createLoyaltyObject({
      objectId,
      classId,
      accountName: userName,
      accountId: userId,
      discountTitle,
      promoCode,
      validUntil,
      imageUrl,
      cardImageDataUrl,
    });
    console.log('[createDiscountPass] Loyalty object created/updated');

    // Генерируем JWT для добавления
    console.log('[createDiscountPass] Generating JWT...');
    const jwt = await generateSaveJWT(classId, objectId);
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;
    console.log('[createDiscountPass] JWT generated, saveUrl:', saveUrl.substring(0, 100) + '...');

    return { saveUrl, jwt };
  } catch (error) {
    console.error('Error creating discount pass:', error);
    throw error;
  }
}

