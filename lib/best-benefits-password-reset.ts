/**
 * BestBenefits Password Reset API
 * 
 * Документация: public/best_benefits/password_reset.pdf
 */

const API_BASE = "https://bestbenefits.ru/api";

export interface ForgotPasswordResponse {
  status: "success" | "error";
  message: string;
  errors?: Record<string, string[]>;
}

export interface ResetPasswordResponse {
  status: "success" | "error";
  message: string;
  errors?: Record<string, string[]>;
}

/**
 * Запрос кода сброса пароля
 * POST /api/password/forgot
 * 
 * Отправляет на указанный e-mail шестизначный код для сброса пароля.
 * Код действует 15 минут, допускает максимум 5 попыток ввода.
 * 
 * Ограничения: не более 3 запросов в минуту с одного источника.
 */
export async function requestPasswordResetCode(
  email: string
): Promise<ForgotPasswordResponse> {
  try {
    const response = await fetch(`${API_BASE}/password/forgot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[BestBenefits Password Reset] Request code failed:", response.status, data);
      return {
        status: "error",
        message: data.message || "Ошибка при запросе кода сброса пароля",
        errors: data.errors,
      };
    }

    console.log("[BestBenefits Password Reset] Code requested successfully for:", email);
    return data;
  } catch (error) {
    console.error("[BestBenefits Password Reset] Error requesting code:", error);
    throw error;
  }
}

/**
 * Смена пароля по коду
 * POST /api/password/reset
 * 
 * Принимает e-mail пользователя, код, полученный по e-mail, и новый пароль.
 * 
 * Ограничения: не более 5 запросов в минуту с одного источника.
 */
export async function resetPassword(
  email: string,
  code: string,
  password: string,
  passwordConfirmation: string
): Promise<ResetPasswordResponse> {
  try {
    // Валидация пароля
    if (password.length < 8) {
      return {
        status: "error",
        message: "Пароль должен быть не менее 8 символов",
      };
    }

    if (password !== passwordConfirmation) {
      return {
        status: "error",
        message: "Пароли не совпадают",
      };
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return {
        status: "error",
        message: "Код должен состоять из 6 цифр",
      };
    }

    const response = await fetch(`${API_BASE}/password/reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        code,
        password,
        password_confirmation: passwordConfirmation,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[BestBenefits Password Reset] Reset failed:", response.status, data);
      return {
        status: "error",
        message: data.message || "Ошибка при сбросе пароля",
        errors: data.errors,
      };
    }

    console.log("[BestBenefits Password Reset] Password reset successfully for:", email);
    return data;
  } catch (error) {
    console.error("[BestBenefits Password Reset] Error resetting password:", error);
    throw error;
  }
}

