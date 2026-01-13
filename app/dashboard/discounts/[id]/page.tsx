"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DiscountItem, DiscountOption } from "@/types/discounts";
import Image from "next/image";
import QRCode from "qrcode";
import { generatePromoCard } from "@/lib/promo-card-generator";
import { handleWalletDownload } from "@/lib/wallet-utils";
import { useSession } from "next-auth/react";

// Санитизация и улучшение HTML описания для красивого отображения
function sanitizeDescription(html: string): string {
  if (!html) return "";
  
  let text = html;
  
  // 1. Удаляем ВСЕ типы маркеров списков (жирные точки, стрелки и т.д.)
  // Используем Unicode коды для надёжности
  const bulletChars = /[\u2022\u2023\u2043\u204C\u204D\u2219\u25AA\u25AB\u25B6\u25B8\u25BA\u25BC\u25C6\u25CB\u25CF\u25D8\u25E6\u2605\u2606\u2713\u2714\u2716\u2717\u27A4\u2B9A●○•◦◆◇■□▪▫▶►▸▹▻→➔➤✓✔☐☑★☆]/g;
  text = text
    .replace(bulletChars, '')                    // Удаляем все bullet-символы
    .replace(/^\s*[-–—―]\s*/gm, '')              // Удаляем тире в начале строки  
    .replace(/\n\s*[-–—―]\s*/g, '\n')            // Удаляем тире после переноса
    .replace(/^\s+/gm, '')                        // Убираем пробелы в начале строк
  
  // 2. Если содержит HTML-теги, обрабатываем их
  if (/<[^>]+>/.test(text)) {
    text = text
      // Убираем все style и class атрибуты
      .replace(/\s*style="[^"]*"/gi, '')
      .replace(/\s*style='[^']*'/gi, '')
      .replace(/\s*class="[^"]*"/gi, '')
      .replace(/\s*class='[^']*'/gi, '')
      // Конвертируем списки в красивый формат
      .replace(/<li[^>]*>/gi, '<li>')
      .replace(/<ul[^>]*>/gi, '<ul class="list-disc ml-6 my-3 space-y-2">')
      .replace(/<ol[^>]*>/gi, '<ol class="list-decimal ml-6 my-3 space-y-2">')
      // Убираем пустые span и div
      .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1')
      .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '<p>$1</p>')
      // Убираем пустые параграфы
      .replace(/<p>\s*<\/p>/gi, '')
      // Убираем br перед закрывающими тегами
      .replace(/<br\s*\/?>\s*<\/(li|p|div)>/gi, '</$1>');
  } else {
    // 3. Это обычный текст - форматируем красиво
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    
    // Определяем строки, которые выглядят как пункты списка
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const processedLines: string[] = [];
    let inList = false;
    let listItems: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Проверяем, начинается ли с маркера списка (цифра или символ)
      const isListItem = /^(\d+[\.\):]|\*|-|–|—|•|●|○|■|▪)\s+/.test(trimmed) ||
                         (trimmed.length > 0 && /^[А-ЯA-Z]/.test(trimmed) && trimmed.length < 200);
      
      if (isListItem && trimmed.includes(':')) {
        // Это заголовок пункта - делаем жирным
        const colonIndex = trimmed.indexOf(':');
        const title = trimmed.slice(0, colonIndex + 1).replace(/^(\d+[\.\):]|\*|-|–|—|•|●|○|■|▪)\s*/, '');
        const content = trimmed.slice(colonIndex + 1).trim();
        
        if (inList) {
          listItems.push(`<li><strong>${title}</strong> ${content}</li>`);
        } else {
          inList = true;
          listItems = [`<li><strong>${title}</strong> ${content}</li>`];
        }
      } else if (isListItem) {
        // Обычный пункт списка
        const cleanedItem = trimmed.replace(/^(\d+[\.\):]|\*|-|–|—|•|●|○|■|▪)\s*/, '');
        if (inList) {
          listItems.push(`<li>${cleanedItem}</li>`);
        } else {
          inList = true;
          listItems = [`<li>${cleanedItem}</li>`];
        }
      } else {
        // Не пункт списка
        if (inList && listItems.length > 0) {
          processedLines.push(`<ul class="list-disc ml-6 my-3 space-y-2">${listItems.join('')}</ul>`);
          listItems = [];
          inList = false;
        }
        processedLines.push(`<p class="mb-3">${trimmed}</p>`);
      }
    }
    
    // Закрываем последний список если есть
    if (inList && listItems.length > 0) {
      processedLines.push(`<ul class="list-disc ml-6 my-3 space-y-2">${listItems.join('')}</ul>`);
    }
    
    text = processedLines.join('');
  }
  
  // 4. Финальная очистка
  text = text
    // Убираем множественные пробелы
    .replace(/\s+/g, ' ')
    // Но сохраняем переносы после тегов
    .replace(/>\s+</g, '><')
    // Добавляем пробелы после точек если их нет
    .replace(/\.([А-ЯA-Z])/g, '. $1')
    // Декодируем HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .trim();
  
  // Если после всех преобразований нет тегов, оборачиваем в параграф
  if (!/<[^>]+>/.test(text) && text.length > 0) {
    text = `<p>${text}</p>`;
  }
  
  return text;
}

export default function DiscountDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const discountId = params.id as string;
  const selectedCityId = searchParams.get('cityId') ? parseInt(searchParams.get('cityId')!) : null;
  
  const [discount, setDiscount] = useState<DiscountItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isClaimed, setIsClaimed] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false); // Модальное окно выбора варианта
  const [activatedPromoCode, setActivatedPromoCode] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null); // ID выбранного варианта
  const [activatingOptionId, setActivatingOptionId] = useState<number | null>(null); // ID варианта в процессе активации
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(!!selectedCityId); // Открыт если выбран город
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const promoCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Сбрасываем флаги при смене скидки
    setHasSynced(false);
    setIsSyncing(false);
    setActivatedPromoCode(null);
    loadDiscount();
    loadPreferences();
  }, [discountId]);

  // Запрашиваем СВЕЖИЙ промокод при открытии страницы активированной скидки
  // (Вкусвилл, ВТБ и др. могут генерировать новый промокод или обновлять срок действия)
  useEffect(() => {
    if (!isClaimed || !discountId) return;

    const refreshPromoCode = async () => {
      console.log(`[DiscountDetail] 🔄 Refreshing promo code for discount ${discountId}...`);
      
      try {
        const response = await fetch("/api/discounts/refresh-promo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discountId: Number(discountId) }),
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log("[DiscountDetail] 📥 Fresh promo result:", result);
          
          if (result.promoCode && result.promoCode.trim().length > 0) {
            const freshCode = result.promoCode.trim();
            
            // Обновляем только если промокод изменился
            if (freshCode !== activatedPromoCode) {
              console.log(`[DiscountDetail] ✅ Updated promo code: "${activatedPromoCode}" → "${freshCode}"`);
              setActivatedPromoCode(freshCode);
              
              // Также обновляем в объекте скидки
              if (discount) {
                setDiscount({
                  ...discount,
                  promoCode: freshCode,
                });
              }
            }
          } else if (result.warning) {
            console.warn(`[DiscountDetail] ⚠️ ${result.warning}`);
          }
        }
      } catch (error) {
        console.warn("[DiscountDetail] Failed to refresh promo code:", error);
      }
    };

    // Обновляем сразу при открытии страницы
    const timeoutId = setTimeout(refreshPromoCode, 500);
    
    // Также обновляем каждые 5 минут для актуальности (на случай если промокод обновляется)
    const intervalId = setInterval(refreshPromoCode, 5 * 60 * 1000);
    
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [isClaimed, discountId, activatedPromoCode, discount]);

  // Обновляем промокод после загрузки discount
  useEffect(() => {
    if (discount && isClaimed) {
      // Используем промокод из discount, если activatedPromoCode еще не установлен
      if (!activatedPromoCode && discount.promoCode && discount.promoCode.trim().length > 0) {
        console.log("✅ Setting promo code from discount after load:", discount.promoCode);
        setActivatedPromoCode(discount.promoCode);
      }
      // Также обновляем discount.promoCode, если есть activatedPromoCode, но нет в discount
      else if (activatedPromoCode && (!discount.promoCode || discount.promoCode.trim().length === 0)) {
        console.log("✅ Updating discount.promoCode from activatedPromoCode:", activatedPromoCode);
        setDiscount({
          ...discount,
          promoCode: activatedPromoCode,
        });
      }
    }
  }, [discount, isClaimed, activatedPromoCode]);

  const loadDiscount = async () => {
    try {
      const response = await fetch(`/api/discounts?ids=${discountId}`);
      const data = await response.json();
      
      if (data.discounts && data.discounts.length > 0) {
        const disc = data.discounts[0];
        console.log("📦 FULL DISCOUNT DATA:", disc);
        console.log("🎫 Promo Code:", disc.promoCode, "Type:", typeof disc.promoCode);
        console.log("📝 Short Description:", disc.shortDescription, "Type:", typeof disc.shortDescription);
        console.log("📄 Description:", disc.description?.substring(0, 200));
        console.log("🔗 Partner URL:", disc.partnerUrl, "Type:", typeof disc.partnerUrl);
        console.log("🎁 Options:", disc.options, "Count:", disc.options?.length || 0);
        setDiscount(disc);
      } else {
        console.error("❌ No discounts in response:", data);
      }
    } catch (error) {
      console.error("Failed to load discount:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncWithBestBenefits = async () => {
    // Защита от бесконечного цикла и повторных вызовов
    if (isSyncing || hasSynced) {
      console.log("⏭️ Sync already in progress or completed, skipping");
      return;
    }

    try {
      setIsSyncing(true);
      console.log("🔄 Starting sync with BestBenefits...");
      
      // Используем менеджер синхронизации с кэшированием
      const { syncManager } = await import("@/lib/sync-manager");
      const result = await syncManager.sync(); // Не форсируем, используем кэш
      
      if (result.success) {
        console.log("✅ Sync result:", result);
        setHasSynced(true);
        
        if (!result.cached) {
          // Перезагружаем preferences только если была реальная синхронизация
          await loadPreferences();
        } else {
          console.log("⏭️ Using cached sync result, preferences already up to date");
        }
      } else {
        console.error("❌ Sync failed:", result.message);
        setHasSynced(true); // Помечаем как выполненную, чтобы не повторять
      }
    } catch (error) {
      console.error("❌ Sync error:", error);
      setHasSynced(true); // Помечаем как выполненную даже при ошибке
    } finally {
      setIsSyncing(false);
    }
  };

  const loadPreferences = async () => {
    try {
      const response = await fetch("/api/discounts/preferences");
      const data = await response.json();
      const filters = data.filters || {};
      
      console.log("📋 LOADED PREFERENCES:", filters);
      
      // Проверяем, есть ли эта скидка в claimed
      const claimedItem = filters.claimed?.find((item: any) => {
        const itemId = typeof item === 'object' && item.id ? item.id : item;
        return itemId === parseInt(discountId);
      });
      const isClaimed = !!claimedItem;
      
      setIsClaimed(isClaimed);
      setIsFavorite(filters.favorites?.includes(parseInt(discountId)) || false);
      
      // Если скидка claimed и есть промокод, устанавливаем его
      if (claimedItem) {
        const promoCode = typeof claimedItem === 'object' ? claimedItem.promoCode : null;
        if (promoCode && promoCode.trim().length > 0) {
          console.log("✅ Found promo code in preferences:", promoCode);
          setActivatedPromoCode(promoCode);
        } else {
          console.log("⚠️ Claimed item found but no promo code:", claimedItem);
          // Если промокода нет, но скидка claimed - синхронизируемся с BestBenefits
          // Но только один раз, чтобы избежать бесконечного цикла
          if (!hasSynced && !isSyncing) {
            console.log("🔄 Syncing with BestBenefits to get promo code...");
            syncWithBestBenefits();
          } else {
            console.log("⏭️ Sync already attempted, skipping");
          }
        }
      } else {
        console.log("⚠️ Discount not found in claimed list");
      }
    } catch (error) {
      console.error("Failed to load preferences:", error);
    }
  };

  const handleClaim = async () => {
    if (!discount) return;
    
    const hasPromoCode = !!(activatedPromoCode || discount.promoCode);
    const hasOptions = !!(discount.options && discount.options.length > 0);
    
    console.log("🔘 HANDLE CLAIM START:", {
      isClaimed,
      hasPromoCode,
      promoCode: discount.promoCode || activatedPromoCode,
      hasOptions,
      optionsCount: discount.options?.length || 0,
    });
    
    // Если есть варианты (options), показываем модальное окно выбора
    if (hasOptions) {
      console.log("🎁 Showing options modal with", discount.options!.length, "options");
      setShowOptionsModal(true);
      return;
    }
    
    // Если уже активирована, просто показываем модальное окно
    if (isClaimed) {
      console.log("⏩ Already claimed, showing modal with promo code:", discount.promoCode || activatedPromoCode);
      setShowPromoModal(true);
      return;
    }
    
    // Если нет вариантов, активируем основную скидку
    await activateDiscount(discount.id);
  };

  // Функция для получения нового промокода (даже если скидка уже активирована)
  const handleGetNewPromoCode = async () => {
    if (!discount) return;
    
    console.log("🔄 Getting NEW promo code for discount:", discount.id);
    
    // Если есть варианты - показываем выбор
    if (discount.options && discount.options.length > 0) {
      setShowPromoModal(false);
      setShowOptionsModal(true);
      return;
    }
    
    // Иначе активируем заново для получения нового промокода
    await activateDiscount(discount.id);
  };

  // Активация конкретного варианта скидки
  const activateOption = async (optionId: number) => {
    if (!discount) return;
    
    console.log("🎯 Activating option:", optionId);
    setActivatingOptionId(optionId);
    
    try {
      await activateDiscount(optionId);
      setSelectedOptionId(optionId);
      setShowOptionsModal(false);
    } finally {
      setActivatingOptionId(null);
    }
  };

  // Универсальная функция активации (для скидки или варианта)
  const activateDiscount = async (idToActivate: number) => {
    if (!discount) return;
    
    console.log("🔄 Activating discount/option:", idToActivate);
    setIsClaimed(true);
    
    try {
      const response = await fetch("/api/discounts/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountId: idToActivate, // ID скидки или варианта
          parentDiscountId: discount.id, // Родительская скидка (для сохранения в preferences)
          promoCode: discount.promoCode || null,
          claimed: [discount.id],
          favorites: isFavorite ? [discount.id] : [],
        }),
      });
      
      const result = await response.json();
      console.log("🎯 ACTIVATION API RESPONSE:", result);
      
      // Перезагружаем preferences чтобы получить сохраненный промокод
      await loadPreferences();
      
      // Определяем промокод для отображения
      const finalPromoCode = result.promoCode || discount.promoCode || activatedPromoCode;
      
      if (finalPromoCode && finalPromoCode.trim().length > 0) {
        console.log("✅ Setting promo code for display:", finalPromoCode);
        setActivatedPromoCode(finalPromoCode);
        setDiscount({
          ...discount,
          promoCode: finalPromoCode,
        });
      } else {
        console.log("⚠️ No promo code available after activation");
      }
      
      // Показываем модальное окно с результатом
      setShowPromoModal(true);
    } catch (error) {
      console.error("❌ Failed to activate:", error);
      // Показываем модальное окно даже при ошибке
      setShowPromoModal(true);
    }
  };

  const handleOpenPartner = () => {
    console.log("🔗 Opening partner URL:", discount?.partnerUrl);
    if (discount?.partnerUrl) {
      console.log("✅ Opening partner site in new tab:", discount.partnerUrl);
      window.open(discount.partnerUrl, "_blank");
    } else {
      console.log("📱 No partner URL, opening My Discounts page");
      router.push("/dashboard/discounts/my");
    }
    setShowPromoModal(false);
  };

  const handleCopyPromo = async () => {
    const promoToCopy = activatedPromoCode || discount?.promoCode;
    console.log("🎫 Copying promo code:", promoToCopy);
    if (!promoToCopy || !navigator?.clipboard) return;

    try {
      await navigator.clipboard.writeText(promoToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("Failed to copy promo code", error);
    }
  };

  // Генерация QR-кода для промокода
  const generateQRCode = useCallback(async (code: string) => {
    try {
      const url = await QRCode.toDataURL(code, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setQrCodeUrl(url);
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    }
  }, []);

  // Генерируем QR-код при открытии модалки с промокодом
  useEffect(() => {
    const promoCode = activatedPromoCode || discount?.promoCode;
    if (showPromoModal && promoCode && promoCode.trim().length > 0) {
      generateQRCode(promoCode);
    }
  }, [showPromoModal, activatedPromoCode, discount?.promoCode, generateQRCode]);

  // Скачивание промокода как картинки
  const handleDownloadPromoCard = async () => {
    if (!discount || isDownloading) return;
    setIsDownloading(true);
    
    try {
      const promoCode = activatedPromoCode || discount.promoCode;
      
      // Функция для проверки, что имя не является географическим названием
      const isValidName = (name: string | null | undefined): boolean => {
        if (!name) return false;
        const geographicNames = [
          "татарстан", "башкортостан", "чувашия", "удмуртия", "мордовия",
          "москва", "петербург", "санкт", "новгород", "казань", "екатеринбург",
          "отлично", "хорошо", "плохо", "да", "нет"
        ];
        const lowerName = name.toLowerCase().trim();
        return !geographicNames.some(geo => lowerName.includes(geo));
      };
      
      // Получаем имя пользователя
      let userName = "Пользователь";
      
      // 1. Пробуем использовать имя из сессии
      if (session?.user?.name && isValidName(session.user.name)) {
        userName = session.user.name;
      } else {
        // 2. Пробуем получить из профиля
        try {
          const userResponse = await fetch("/api/profile");
          if (userResponse.ok) {
            const userData = await userResponse.json();
            const firstName = userData.user?.firstName;
            const lastName = userData.user?.lastName;
            
            // Проверяем валидность имени и фамилии
            if (firstName && lastName && isValidName(firstName) && isValidName(lastName)) {
              userName = `${firstName} ${lastName}`;
            } else if (userData.user?.email) {
              // Используем email как fallback
              userName = userData.user.email.split("@")[0];
            }
          }
        } catch (error) {
          console.error("Failed to fetch user profile:", error);
        }
      }

      // Генерируем карточку используя новую функцию
      const { blob, dataUrl } = await generatePromoCard({
        promoCode: promoCode || undefined,
        userName: userName,
        discountName: discount.title,
        discountDescription: discount.shortDescription,
        imageUrl: discount.imageUrl ?? undefined,
        validUntil: discount.validUntil ? new Date(discount.validUntil) : undefined,
      });

      // Используем новую логику Wallet для скачивания
      await handleWalletDownload({
        imageBlob: blob,
        imageDataUrl: dataUrl,
        discountId: discount.id,
        discountTitle: discount.title,
        promoCode: promoCode || undefined,
        userName: userName,
        validUntil: discount.validUntil ? new Date(discount.validUntil) : undefined,
      });
      
    } catch (error) {
      console.error("Failed to download promo card:", error);
      alert(`Не удалось создать карточку: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleToggleFavorite = async () => {
    const nextFavorite = !isFavorite;
    setIsFavorite(nextFavorite);

    try {
      await fetch("/api/discounts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            favorites: nextFavorite ? [parseInt(discountId)] : [],
            claimed: isClaimed ? [parseInt(discountId)] : [],
          },
        }),
      });
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(!nextFavorite);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!discount) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Скидка не найдена</h2>
          <button
            onClick={() => router.push("/dashboard/discounts")}
            className="mt-4 text-blue-600 hover:underline"
          >
            ← Вернуться к скидкам
          </button>
        </div>
      </div>
    );
  }

  // Вычисляем displayPromoCode каждый раз при рендере, чтобы он обновлялся после активации
  const displayPromoCode = activatedPromoCode || discount?.promoCode;
  const hasPartnerUrl = !!discount?.partnerUrl;
  
  // Логируем только когда модалка открыта
  if (showPromoModal) {
    console.log("🎫 MODAL DISPLAYED WITH:", {
      activatedPromoCode,
      discountPromoCode: discount?.promoCode,
      displayPromoCode,
      displayPromoCodeExists: !!displayPromoCode,
      displayPromoCodeTrimmed: displayPromoCode?.trim(),
      hasShortDescription: !!discount?.shortDescription,
      hasPartnerUrl,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-4 py-4 pb-20 sm:px-6 sm:py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          Назад к скидкам
        </button>

        {/* Main Content */}
        <div className="overflow-hidden rounded-xl bg-white shadow-lg dark:bg-gray-800">
          {/* Image */}
          {discount.imageUrl && (
            <div className="relative w-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <img
                src={discount.imageUrl}
                alt={discount.title}
                className="w-full h-auto max-h-96 object-contain"
                loading="lazy"
                decoding="async"
                fetchPriority="high"
              />
              {/* Badges */}
              <div className="absolute right-2 top-2 flex flex-col gap-2 sm:right-4 sm:top-4">
                {discount.isPremium && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold uppercase text-white shadow">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Premium
                  </span>
                )}
                {isClaimed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold uppercase text-white shadow">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Получено
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="p-4 sm:p-6 md:p-8">
            {/* Title & Favorite */}
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl md:text-3xl">
                {discount.title}
              </h1>
              <button
                onClick={handleToggleFavorite}
                className="flex-shrink-0 rounded-full p-2 transition hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
              >
                <svg
                  className={`h-6 w-6 ${
                    isFavorite ? "fill-red-500 text-red-500" : "text-gray-400"
                  }`}
                  viewBox="0 0 20 20"
                  fill={isFavorite ? "currentColor" : "none"}
                  stroke="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Category & Cities */}
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-4">
              {discount.mainCategory && (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {discount.mainCategory.name}
                </span>
              )}
              {discount.cities && discount.cities.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    {discount.cities.length <= 5
                      ? discount.cities.map((c) => c.name).join(", ")
                      : `${discount.cities.slice(0, 5).map((c) => c.name).join(", ")} и ещё ${discount.cities.length - 5}`
                    }
                  </span>
                </div>
              )}
            </div>

            {/* Short Description - краткое описание вверху */}
            {discount.shortDescription && discount.shortDescription.trim().length > 0 && (
              <div className="mt-4 sm:mt-6">
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
                  <div 
                    className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 sm:text-base"
                    dangerouslySetInnerHTML={{ __html: sanitizeDescription(discount.shortDescription) }}
                  />
                </div>
              </div>
            )}

            {/* Promo Code */}
            {(() => {
              // Используем промокод из activatedPromoCode или discount.promoCode
              const promoCodeToShow = activatedPromoCode || discount.promoCode;
              // Проверяем, не является ли промокод специальным случаем
              const isSpecialCase = promoCodeToShow && (
                promoCodeToShow === "Штрихкод в купоне" ||
                promoCodeToShow.toLowerCase().includes("штрихкод") ||
                promoCodeToShow.toLowerCase().includes("barcode")
              );
              
              // Показываем промокод только если скидка активирована и есть промокод
              if (!isClaimed || !promoCodeToShow || promoCodeToShow.trim().length === 0) {
                return null;
              }
              
              // Если специальный случай, показываем инструкцию
              if (isSpecialCase) {
                return (
                  <div className="mt-4 sm:mt-6">
                    <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-sm dark:border-blue-700 dark:from-blue-900/30 dark:to-blue-900/20 sm:p-5">
                      <div className="mb-3 flex justify-center">
                        <svg className="h-16 w-16 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                      </div>
                      <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-white">
                        Используйте штрихкод из купона
                      </h3>
                      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                        Покажите QR-код кассиру в магазине для получения скидки
                      </p>
                    </div>
                  </div>
                );
              }
              
              // Обычный промокод
              return (
                <div className="mt-4 sm:mt-6">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Промокод</h3>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                    {/* Промокод одной строкой */}
                    <div className="mb-3 flex items-center justify-center">
                      <span className="rounded-lg bg-white px-4 py-2 font-mono text-lg font-bold tracking-wider text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white sm:text-xl">
                        {promoCodeToShow}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyPromo}
                      className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition sm:text-base ${
                        copied 
                          ? "bg-emerald-500 text-white" 
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {copied ? (
                        <>
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Скопировано!
                        </>
                      ) : (
                        <>
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                          Скопировать код
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Valid Until */}
            {discount.validUntil && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Действует до: {new Date(discount.validUntil).toLocaleDateString("ru-RU")}</span>
              </div>
            )}

            {/* Full Description - полное описание внизу */}
            {discount.description && discount.description.trim().length > 0 && (
              <div className="mt-6 sm:mt-8">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                  Условия использования
                </h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
                  <div 
                    className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 sm:text-base
                      [&_p]:mb-4 [&_p]:last:mb-0
                      [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-2
                      [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-2
                      [&_li]:leading-relaxed
                      [&_strong]:font-semibold [&_strong]:text-gray-900 [&_strong]:dark:text-white
                      [&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline [&_a]:transition-colors
                      [&_a:hover]:text-blue-700
                      [&_a]:dark:text-blue-400 [&_a:hover]:dark:text-blue-300"
                    dangerouslySetInnerHTML={{ 
                      __html: sanitizeDescription(discount.description)
                    }}
                  />
                </div>
              </div>
            )}

            {/* Locations Map - адреса на карте */}
            {(() => {
              // Фильтруем города по выбранному городу из фильтров
              const citiesToShow = selectedCityId
                ? discount.cities.filter(city => city.id === selectedCityId)
                : discount.cities;
              
              const showMap = citiesToShow && citiesToShow.length > 0 && citiesToShow[0].name !== "Онлайн";
              
              return showMap ? (
                <div className="mt-6 sm:mt-8">
                  {/* Заголовок-аккордеон */}
                  <button
                    onClick={() => setIsMapExpanded(!isMapExpanded)}
                    className="mb-4 flex w-full items-center justify-between text-left"
                  >
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white sm:text-xl">
                      На карте
                      {!selectedCityId && citiesToShow.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                          ({citiesToShow.length} {citiesToShow.length === 1 ? 'город' : citiesToShow.length < 5 ? 'города' : 'городов'})
                        </span>
                      )}
                    </h2>
                    <svg
                      className={`h-5 w-5 text-gray-500 transition-transform dark:text-gray-400 ${isMapExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Контент аккордеона */}
                  {isMapExpanded && (
                    <>
                      {citiesToShow.length === 0 && selectedCityId ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            В выбранном городе эта скидка недоступна
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                          <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {citiesToShow.map((city) => (
                              <div key={city.id} className="p-4 sm:p-6">
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
                                    <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                      <path
                                        fillRule="evenodd"
                                        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                                      {city.name}
                                    </h3>
                                    {city.coordinates && (
                                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        Координаты: {city.coordinates.lat.toFixed(4)}, {city.coordinates.lng.toFixed(4)}
                                      </p>
                                    )}
                                  </div>
                                  {city.coordinates && (
                                    <a
                                      href={`https://yandex.ru/maps/?ll=${city.coordinates.lng},${city.coordinates.lat}&z=14&pt=${city.coordinates.lng},${city.coordinates.lat},pm2rdm`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:ring-offset-gray-800"
                                    >
                                      Открыть карту
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null;
            })()}

            {/* Action Buttons */}
            <div className="mt-6 sm:mt-8 space-y-3">
              {/* Основная кнопка */}
              <button
                onClick={handleClaim}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold text-white shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:ring-offset-gray-800 sm:px-6 sm:py-4 sm:text-lg ${
                  isClaimed
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isClaimed ? (
                  <>
                    <span>Открыть промокод</span>
                    <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </>
                ) : discount.options && discount.options.length > 0 ? (
                  <>
                    <span>Выбрать вариант</span>
                    <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                  </>
                ) : (
                  <>
                    <span>Получить промокод</span>
                    <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                  </>
                )}
              </button>

              {/* Кнопка "Получить новый" для уже активированных скидок */}
              {isClaimed && (
                <button
                  onClick={handleGetNewPromoCode}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-blue-600 bg-transparent px-4 py-3 text-base font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:ring-offset-gray-800 sm:px-6 sm:py-4 sm:text-lg"
                >
                  <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  <span>Получить новый промокод</span>
                </button>
              )}

              <p className="text-center text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                {isClaimed
                  ? "Нажмите «Получить новый» для генерации нового промокода"
                  : discount.options && discount.options.length > 0
                    ? `Доступно ${discount.options.length} ${discount.options.length === 1 ? 'вариант' : discount.options.length < 5 ? 'варианта' : 'вариантов'} скидки`
                    : "При нажатии будет сгенерирован промокод"}
              </p>
            </div>
          </div>
        </div>

        {/* Promo Code Modal - Прямоугольная карточка */}
        {showPromoModal && discount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
            <div className="relative w-full max-w-2xl my-8">
              {/* Прямоугольная карточка промокода 16:9 */}
              <div 
                ref={promoCardRef}
                className="relative overflow-hidden rounded-2xl shadow-2xl"
                style={{ aspectRatio: '16/9' }}
              >
                {/* Фоновое изображение с blur */}
                <div className="absolute inset-0">
                  {discount.imageUrl ? (
                    <img
                      src={discount.imageUrl}
                      alt=""
                      className="h-full w-full object-cover scale-125 blur-2xl"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900" />
                  )}
                  {/* Затемнение для читаемости */}
                  <div className="absolute inset-0 bg-black/40" />
                </div>

                {/* Контент карточки */}
                <div className="relative h-full flex flex-col p-5 sm:p-6">
                  {/* Верхний ряд: Заголовок слева, QR справа */}
                  <div className="flex justify-between items-start gap-4">
                    {/* Заголовок слева */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-semibold text-white leading-tight line-clamp-2 drop-shadow-lg">
                        {discount.title}
                      </h3>
                      {discount.validUntil && (
                        <p className="mt-1 text-xs text-white/70 drop-shadow">
                          до {new Date(discount.validUntil).toLocaleDateString('ru-RU')}
                        </p>
                      )}
                    </div>

                    {/* QR-код справа */}
                    {qrCodeUrl && displayPromoCode && displayPromoCode.trim().length > 0 && (
                      <div className="flex-shrink-0 rounded-lg bg-white p-1.5 shadow-xl">
                        <img src={qrCodeUrl} alt="QR Code" className="h-16 w-16 sm:h-20 sm:w-20" />
                      </div>
                    )}
                  </div>

                  {/* Промокод по центру */}
                  <div className="flex-1 flex items-center justify-center">
                    {displayPromoCode && displayPromoCode.trim().length > 0 ? (
                      <div className="rounded-xl bg-white px-6 py-3 sm:px-8 sm:py-4 shadow-2xl border-4 border-white">
                        <span className="font-mono text-xl sm:text-3xl font-black text-slate-900 tracking-wider">
                          {displayPromoCode}
                        </span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-5xl mb-2">🎉</div>
                        <p className="text-white/90 font-medium text-sm sm:text-base max-w-xs">
                          {discount.shortDescription 
                            ? discount.shortDescription.replace(/<[^>]*>/g, '').substring(0, 100)
                            : "Покажите эту карточку для получения скидки"
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Нижний ряд: кнопки действий */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Копировать */}
                    {displayPromoCode && displayPromoCode.trim().length > 0 ? (
                      <button
                        onClick={handleCopyPromo}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                          copied 
                            ? "bg-emerald-500 text-white" 
                            : "bg-white/90 text-slate-800 hover:bg-white"
                        }`}
                      >
                        {copied ? (
                          <>
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            <span className="hidden sm:inline">Скопировано</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                            </svg>
                            <span className="hidden sm:inline">Скопировать</span>
                          </>
                        )}
                      </button>
                    ) : discount.options && discount.options.length > 0 ? (
                      <button
                        onClick={() => {
                          setShowPromoModal(false);
                          setShowOptionsModal(true);
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden sm:inline">Выбрать вариант</span>
                      </button>
                    ) : (
                      <div />
                    )}

                    {/* Правая группа кнопок */}
                    <div className="flex items-center gap-2">
                      {/* Скачать */}
                      <button
                        onClick={handleDownloadPromoCard}
                        disabled={isDownloading}
                        className="flex items-center gap-1.5 rounded-lg bg-white/20 backdrop-blur px-3 py-2 text-sm font-semibold text-white hover:bg-white/30 disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden sm:inline">Скачать</span>
                      </button>

                      {/* Избранное */}
                      <button
                        onClick={handleToggleFavorite}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                          isFavorite 
                            ? "bg-rose-500 text-white" 
                            : "bg-white/20 backdrop-blur text-white hover:bg-white/30"
                        }`}
                      >
                        <svg className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} viewBox="0 0 20 20" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Кнопка закрытия - вынесена за пределы карточки */}
              <button
                onClick={() => setShowPromoModal(false)}
                className="absolute -right-3 -top-3 rounded-full bg-white p-2 text-gray-600 shadow-lg transition hover:bg-gray-100 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Дополнительные кнопки под карточкой */}
              <div className="mt-4 flex flex-col sm:flex-row justify-center gap-3">
                {/* Кнопка получить новый промокод */}
                <button
                  onClick={handleGetNewPromoCode}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Получить новый промокод
                </button>

                {discount.partnerUrl && (
                  <button
                    onClick={handleOpenPartner}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                    Перейти на сайт партнёра
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Options Selection Modal - выбор варианта скидки */}
        {showOptionsModal && discount && discount.options && discount.options.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-md dark:backdrop-blur-lg p-4">
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
              {/* Close button */}
              <button
                onClick={() => setShowOptionsModal(false)}
                className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Title */}
              <h2 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">
                Выберите предложение
              </h2>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Вариантов: {discount.options.length}
              </p>

              {/* Options list */}
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {discount.options.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
                        {option.name}
                      </p>
                    </div>
                    <button
                      onClick={() => activateOption(option.id)}
                      disabled={activatingOptionId !== null}
                      className={`flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-md transition ${
                        activatingOptionId === option.id
                          ? "bg-gray-400 cursor-wait"
                          : "bg-rose-600 hover:bg-rose-700 hover:shadow-lg active:scale-95"
                      }`}
                    >
                      {activatingOptionId === option.id ? (
                        <span className="flex items-center gap-2">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>...</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          Получить
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {/* Cancel button */}
              <button
                onClick={() => setShowOptionsModal(false)}
                className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

