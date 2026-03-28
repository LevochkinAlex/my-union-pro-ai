import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import {
  Button,
  Divider,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { appConfig } from "../config/appConfig";
import { getTelegramStoreUrl, isTelegramClientInstalled } from "../lib/telegramClient";
import {
  buildTelegramOAuthUrl,
  sendEmailMagicLink,
  startBotAppLoginSession,
  type MobileAuthSuccess,
} from "../services/chatApi";

const APP_SCHEME = "myunion";

type Step = "input" | "email-sent";

type Props = {
  onAuthenticated: (data: MobileAuthSuccess) => void | Promise<void>;
};

export function LoginScreen({ onAuthenticated: _onAuthenticated }: Props) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>("input");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramGuideVisible, setTelegramGuideVisible] = useState(false);

  async function handleEmailSubmit() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Неверный формат email");
      return;
    }
    setLoading(true);
    try {
      await sendEmailMagicLink(trimmed);
      setStep("email-sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить письмо");
    } finally {
      setLoading(false);
    }
  }

  async function ensureTelegramOrAlert(): Promise<boolean> {
    if (Platform.OS === "web") return true;
    const hasTg = await isTelegramClientInstalled();
    if (hasTg) return true;
    Alert.alert(
      "Нужен Telegram",
      "Установите Telegram, затем снова нажмите кнопку входа.",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Установить Telegram", onPress: () => void Linking.openURL(getTelegramStoreUrl()) },
      ],
    );
    return false;
  }

  async function handleBotLogin() {
    setError(null);
    if (!(await ensureTelegramOrAlert())) return;
    setLoading(true);
    try {
      const { botUrl } = await startBotAppLoginSession();
      await Linking.openURL(botUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось начать вход через бота");
    } finally {
      setLoading(false);
    }
  }

  async function startTelegramLoginFlow() {
    setError(null);
    if (!appConfig.telegramLoginOrigin) {
      setError("Telegram Login работает только с HTTPS. Задайте telegramLoginOrigin в app.json (ваш продовый домен из BotFather).");
      return;
    }

    if (!(await ensureTelegramOrAlert())) return;

    setTelegramGuideVisible(true);
  }

  async function launchTelegramOAuth() {
    setTelegramGuideVisible(false);
    setLoading(true);
    try {
      const redirectUri = Linking.createURL("auth");
      const oauthUrl = buildTelegramOAuthUrl(redirectUri, APP_SCHEME);

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = oauthUrl;
        return;
      }

      await Linking.openURL(oauthUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка Telegram");
    } finally {
      setLoading(false);
    }
  }

  if (step === "email-sent") {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.sentWrap}>
            <Text variant="headlineSmall" style={{ fontWeight: "700", textAlign: "center" }}>
              Проверьте почту
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 8 }}>
              Мы отправили ссылку для входа на{"\n"}
              <Text style={{ fontWeight: "700" }}>{email}</Text>
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.outline, textAlign: "center", marginTop: 12 }}>
              Откройте ссылку на этом телефоне — вы войдёте автоматически. Ссылка действительна 15 минут.
            </Text>
            <Button
              mode="text"
              onPress={() => { setStep("input"); setEmail(""); setError(null); }}
              style={{ marginTop: 20 }}
            >
              Изменить email
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text variant="headlineLarge" style={styles.brand}>МойСоюз</Text>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          Выберите способ входа
        </Text>

        {error ? (
          <HelperText type="error" visible style={styles.errorText}>
            {error}
          </HelperText>
        ) : null}

        <Button
          mode="contained"
          onPress={() => void handleBotLogin()}
          loading={loading}
          disabled={loading}
          icon="telegram"
          buttonColor="#0088cc"
          textColor="#fff"
          style={styles.actionButton}
          contentStyle={styles.actionButtonContent}
          labelStyle={styles.actionButtonLabel}
        >
          Войти через бота
        </Button>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 10 }}>
          Откроется чат с @myunionpro_bot. Бот пришлёт кнопку «Вернуться в приложение» — нажмите её, чтобы завершить вход.
        </Text>

        <Button
          mode="outlined"
          onPress={startTelegramLoginFlow}
          loading={loading}
          disabled={loading}
          style={[styles.actionButton, styles.oauthAltButton]}
          contentStyle={styles.actionButtonContent}
          labelStyle={styles.actionButtonLabel}
        >
          Вход через сайт Telegram (браузер)
        </Button>
        <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 6 }}>
          Альтернатива без бота: страница oauth.telegram.org в Safari.
        </Text>

        <Modal
          visible={telegramGuideVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setTelegramGuideVisible(false)}
        >
          <Pressable
            style={[styles.tgModalBackdrop, { backgroundColor: "rgba(15, 23, 42, 0.45)" }]}
            onPress={() => setTelegramGuideVisible(false)}
          >
            <Pressable style={[styles.tgModalCard, { backgroundColor: theme.colors.surface }]} onPress={(e) => e.stopPropagation()}>
              <Text variant="titleLarge" style={styles.tgModalTitle}>
                Вход через Telegram
              </Text>
              <ScrollView style={styles.tgModalScroll} showsVerticalScrollIndicator={false}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                  Telegram не даёт сторонним приложениям открыть вас сразу после «Принять» в чате — токен передаётся через браузер. Поэтому важно не закрывать вкладку Safari до конца входа.
                </Text>
                <Text variant="titleSmall" style={{ marginBottom: 8 }}>
                  Как это работает
                </Text>
                <Text variant="bodyMedium" style={styles.stepLine}>
                  1. Откроется Safari со страницей входа Telegram (номер, код — там же).
                </Text>
                <Text variant="bodyMedium" style={styles.stepLine}>
                  2. В Telegram может прийти сообщение: запрос на вход на myunion.pro и кнопки «Принять» / «Отклонить» — это штатно.
                </Text>
                <Text variant="bodyMedium" style={styles.stepLine}>
                  3. Нажмите «Принять» в Telegram, затем вернитесь в Safari (свайп по нижнему краю или из списка приложений). Страница дождётся подтверждения и сама перенаправит в МойСоюз уже авторизованным.
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 12 }}>
                  Если Safari закрыли до завершения, начните вход снова. Прямой переход только из чата Telegram в приложение с готовым входом Telegram для нас сделать нельзя — ограничение платформы, не нашего кода.
                </Text>
              </ScrollView>
              <View style={styles.tgModalActions}>
                <Button mode="outlined" onPress={() => setTelegramGuideVisible(false)} style={styles.tgModalActionBtn}>
                  Отмена
                </Button>
                <Button mode="contained" onPress={() => void launchTelegramOAuth()} style={styles.tgModalActionBtn}>
                  Открыть страницу входа
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={styles.dividerRow}>
          <Divider style={styles.dividerLine} />
          <Text variant="bodySmall" style={{ color: theme.colors.outline, paddingHorizontal: 12 }}>или</Text>
          <Divider style={styles.dividerLine} />
        </View>

        <TextInput
          mode="outlined"
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          style={styles.emailInput}
        />

        <Button
          mode="contained"
          onPress={handleEmailSubmit}
          loading={loading}
          disabled={loading}
          style={styles.actionButton}
          contentStyle={styles.actionButtonContent}
          labelStyle={styles.actionButtonLabel}
        >
          Продолжить
        </Button>

        <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 8 }}>
          Отправим ссылку для входа на email
        </Text>

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 24 }}>
          Нет аккаунта? Регистрация автоматическая при первом входе.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const BUTTON_RADIUS = 14;
const BUTTON_HEIGHT = 52;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brand: { fontWeight: "700", letterSpacing: -0.5 },
  errorText: { marginTop: 8, fontSize: 14 },
  actionButton: { marginTop: 16, borderRadius: BUTTON_RADIUS },
  oauthAltButton: { marginTop: 12 },
  actionButtonContent: { height: BUTTON_HEIGHT },
  actionButtonLabel: { fontSize: 16, fontWeight: "600", letterSpacing: 0.15 },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: { flex: 1 },
  emailInput: { marginBottom: 0 },
  sentWrap: { alignItems: "center", paddingTop: 40 },
  stepLine: { marginBottom: 8 },
  tgModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  tgModalCard: {
    borderRadius: 10,
    maxHeight: "82%",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  tgModalTitle: {
    fontWeight: "700",
    marginBottom: 12,
  },
  tgModalScroll: {
    maxHeight: 360,
  },
  tgModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148, 163, 184, 0.35)",
  },
  tgModalActionBtn: {
    borderRadius: 8,
    marginLeft: 4,
  },
});
