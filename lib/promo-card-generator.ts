/**
 * Генератор красивых карточек с промокодами
 * Создает PNG изображение с QR-кодом, промокодом и информацией о пользователе
 * Или карточку без промокода с изображением и описанием скидки
 */

import QRCode from 'qrcode';

interface PromoCardData {
  promoCode?: string; // Опционально
  userName: string;
  discountName: string;
  discountDescription?: string; // Описание для карточек без промокода
  imageUrl?: string;
  validUntil?: Date;
}

/**
 * Вспомогательная функция для обрезки текста по ширине
 */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) {
    return text;
  }
  
  let truncated = text;
  while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

/**
 * Разбивает текст на строки по максимальной ширине
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Генерирует красивую карточку в формате Blob и dataURL
 */
export async function generatePromoCard(data: PromoCardData): Promise<{ blob: Blob; dataUrl: string }> {
  const {
    promoCode,
    userName,
    discountName,
    discountDescription,
    imageUrl,
    validUntil,
  } = data;

  console.log('[promo-card] Starting generation with:', { promoCode, userName, discountName });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  const width = 1200;
  const height = 630;
  canvas.width = width;
  canvas.height = height;
  
  console.log('[promo-card] Canvas created:', { width, height });

  // ШАГ 1: Рисуем фон
  console.log('[promo-card] Step 1: Drawing background');
  
  // Градиент как основа
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Если есть изображение скидки, рисуем его поверх
  if (imageUrl) {
    try {
      console.log('[promo-card] Loading background image');
      
      let imageSrc = imageUrl;
      if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('/')) {
        imageSrc = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      }
      
      const bgImg = new Image();
      if (!imageUrl.startsWith('data:')) {
        bgImg.crossOrigin = 'anonymous';
      }
      
      await new Promise<void>((resolve, reject) => {
        bgImg.onload = () => resolve();
        bgImg.onerror = () => reject(new Error('Image load failed'));
        bgImg.src = imageSrc;
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      
      // Рисуем изображение на весь фон с затемнением
      const imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;
      const canvasRatio = width / height;
      let drawWidth, drawHeight, offsetX, offsetY;
      
      if (imgRatio > canvasRatio) {
        drawHeight = height;
        drawWidth = height * imgRatio;
        offsetX = (width - drawWidth) / 2;
        offsetY = 0;
      } else {
        drawWidth = width;
        drawHeight = width / imgRatio;
        offsetX = 0;
        offsetY = (height - drawHeight) / 2;
      }
      
      ctx.filter = 'blur(15px) brightness(0.5)';
      ctx.drawImage(bgImg, offsetX, offsetY, drawWidth, drawHeight);
      ctx.filter = 'none';
      
      console.log('[promo-card] Background image drawn');
    } catch (error) {
      console.warn('[promo-card] Failed to load background image:', error);
    }
  }

  // ШАГ 2: Рисуем полупрозрачную карточку
  console.log('[promo-card] Step 2: Drawing card overlay');
  
  const cardPadding = 40;
  const cardX = cardPadding;
  const cardY = cardPadding;
  const cardWidth = width - cardPadding * 2;
  const cardHeight = height - cardPadding * 2;
  
  // Полупрозрачная белая карточка
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 20);
  ctx.fill();
  
  // Белая граница
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 20);
  ctx.stroke();
  
  console.log('[promo-card] Step 3: Drawing text content');

  if (promoCode) {
    // РЕЖИМ С ПРОМОКОДОМ
    console.log('[promo-card] Drawing promo code mode');
    
    // Название скидки
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.textAlign = 'left';
    const maxTextWidth = cardWidth - 250;
    const truncatedName = truncateText(ctx, discountName, maxTextWidth);
    ctx.fillText(truncatedName, cardX + 30, cardY + 50);
    
    // Заголовок "Промокод:"
    const promoY = cardY + 140;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Inter, sans-serif';
    ctx.fillText('Промокод:', cardX + 30, promoY);
    
    // Белое поле с промокодом
    const codeX = cardX + 30;
    const codeY = promoY + 55;
    const codeBoxWidth = cardWidth - 280;
    const codeBoxHeight = 90;
    
    // Белый фон
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.roundRect(codeX, codeY, codeBoxWidth, codeBoxHeight, 12);
    ctx.fill();
    
    // Синяя рамка
    ctx.beginPath();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 4;
    ctx.roundRect(codeX, codeY, codeBoxWidth, codeBoxHeight, 12);
    ctx.stroke();
    
    // Текст промокода
    ctx.fillStyle = '#667eea';
    ctx.font = 'bold 48px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(promoCode || 'N/A', codeX + codeBoxWidth / 2, codeY + 60);
    
    console.log('[promo-card] Promo code drawn');

  } else {
    // РЕЖИМ БЕЗ ПРОМОКОДА: Картинка + описание
    
    // Название скидки
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.textAlign = 'left';
    
    const titleLines = wrapText(ctx, discountName, cardWidth - 60);
    let currentY = cardY + 50;
    titleLines.slice(0, 2).forEach((line) => {
      ctx.fillText(line, cardX + 30, currentY);
      currentY += 45;
    });

    // Картинка скидки (если есть)
    if (imageUrl) {
      try {
        // Используем прокси для обхода CORS
        let imageSrc = imageUrl;
        if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('/')) {
          imageSrc = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
        }
        
        const img = new Image();
        if (!imageUrl.startsWith('data:')) {
          img.crossOrigin = 'anonymous';
        }
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => resolve(null); // Игнорируем ошибки загрузки
          img.src = imageSrc;
        });
        
        if (img.complete && img.naturalWidth > 0) {
          const imgSize = 200;
          const imgX = cardX + cardWidth - imgSize - 30;
          const imgY = cardY + 30;
          
          // Рисуем картинку с закругленными углами
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 15);
          ctx.clip();
          ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
          ctx.restore();
          
          // Рамка вокруг картинки
          ctx.beginPath();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 2;
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 15);
          ctx.stroke();
        }
      } catch (error) {
        console.error('Failed to load discount image:', error);
      }
    }

    // Описание скидки
    if (discountDescription) {
      currentY += 30;
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px Inter, sans-serif';
      
      const descLines = wrapText(ctx, discountDescription, cardWidth - 280);
      descLines.slice(0, 4).forEach((line) => {
        ctx.fillText(line, cardX + 30, currentY);
        currentY += 30;
      });
    }
  }

  // Информация внизу карточки
  console.log('[promo-card] Drawing footer info');
  
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px Inter, sans-serif';
  const infoY = cardY + cardHeight - 120;
  const iconSize = 20;
  const iconTextGap = 30;
  
  // Функция для рисования иконки пользователя (силуэт)
  function drawUserIcon(x: number, y: number) {
    ctx.fillStyle = '#ffffff';
    // Голова
    ctx.beginPath();
    ctx.arc(x + iconSize / 2, y - 12, 4, 0, Math.PI * 2);
    ctx.fill();
    // Тело
    ctx.beginPath();
    ctx.arc(x + iconSize / 2, y - 2, 6, 0, Math.PI, true);
    ctx.fill();
  }
  
  // Функция для рисования иконки магазина
  function drawStoreIcon(x: number, y: number) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    // Крыша
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + iconSize / 2, y - 15);
    ctx.lineTo(x + iconSize, y - 10);
    ctx.stroke();
    // Здание
    ctx.strokeRect(x + 3, y - 10, iconSize - 6, 10);
    // Дверь
    ctx.fillRect(x + 7, y - 6, 6, 6);
  }
  
  // Функция для рисования иконки партнерства (звезда)
  function drawPartnerIcon(x: number, y: number) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const cx = x + iconSize / 2;
    const cy = y - 7;
    const spikes = 5;
    const outerRadius = 8;
    const innerRadius = 4;
    
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  
  // Функция для рисования иконки часов
  function drawClockIcon(x: number, y: number) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    const cx = x + iconSize / 2;
    const cy = y - 7;
    // Циферблат
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.stroke();
    // Стрелки
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 3, cy);
    ctx.stroke();
  }
  
  // Пользователь
  drawUserIcon(cardX + 30, infoY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(userName, cardX + 30 + iconTextGap, infoY);
  
  // Выдано
  const issuerName = discountName.length > 40 ? discountName.substring(0, 37) + '...' : discountName;
  drawStoreIcon(cardX + 30, infoY + 30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Выдано: ${issuerName}`, cardX + 30 + iconTextGap, infoY + 30);
  
  // Партнер
  drawPartnerIcon(cardX + 30, infoY + 55);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Партнер: MyUnion`, cardX + 30 + iconTextGap, infoY + 55);
  
  // Срок действия
  if (validUntil) {
    const dateStr = validUntil.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    drawClockIcon(cardX + 30, infoY + 85);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Действует до: ${dateStr}`, cardX + 30 + iconTextGap, infoY + 85);
  }

  // ШАГ 4: QR-код (рисуем последним, чтобы был поверх)
  if (promoCode) {
    console.log('[promo-card] Step 4: Drawing QR code');
    
    const qrSize = 180;
    const qrX = cardX + cardWidth - qrSize - 30;
    const qrY = cardY + 30;
    
    try {
      // Генерируем QR-код
      const qrDataUrl = await QRCode.toDataURL(promoCode, {
        width: qrSize * 2,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });
      
      const qrImage = new Image();
      await new Promise<void>((resolve, reject) => {
        qrImage.onload = () => resolve();
        qrImage.onerror = reject;
        qrImage.src = qrDataUrl;
        setTimeout(() => reject(new Error('QR timeout')), 3000);
      });
      
      // Белый фон для QR
      const padding = 10;
      
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.roundRect(qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2, 12);
      ctx.fill();
      
      // Рисуем QR-код
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
      
      console.log('[promo-card] QR code drawn');
    } catch (error) {
      console.error('[promo-card] QR generation failed:', error);
    }
  }

  // ШАГ 5: Конвертируем в изображение
  console.log('[promo-card] Step 5: Converting to image');
  
  const dataUrl = canvas.toDataURL('image/png');
  
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        console.log('[promo-card] Generation complete:', { size: blob.size, type: blob.type });
        resolve({ blob, dataUrl });
      } else {
        console.error('[promo-card] Failed to generate blob');
        reject(new Error('Failed to generate image blob'));
      }
    }, 'image/png');
  });
}
