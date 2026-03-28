import { useState } from "react";
import {
  ActivityIndicator,
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
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { appConfig } from "../config/appConfig";
import { extractMobileLoginToken } from "../lib/extractMobileLoginToken";
import { getTelegramStoreUrl, isTelegramClientInstalled } from "../lib/telegramClient";
import {
  buildTelegramOAuthUrl,
  exchangeMagicLinkToken,
  sendEmailMagicLink,
  startBotAppLoginSession,
  type MobileAuthSuccess,
} from "../services/chatApi";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { IconDarkSvg } from "../components/IconDarkSvg";
import { FluidText, FluidButton, FluidInput, GlassCard } from "../components/ui";
import { colors, fonts, radii, spacing } from "../theme/tokens";

const APP_SCHEME = "myunion";
type Step = "input" | "email-sent";

type Props = {
  onAuthenticated: (data: MobileAuthSuccess) => void | Promise<void>;
};

function getExpoHostPort(): string | null {
  try {
    const appUrl = Linking.createURL("/");
    const parsed = new URL(appUrl);
    if (!parsed.hostname) return null;
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return null;
  }
}

export function LoginScreen({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [email, setEmail] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramGuideVisible, setTelegramGuideVisible] = useState(false);
  const isExpoGo = Constants.appOwnership === "expo";

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
      const expoHost = isExpoGo ? getExpoHostPort() : null;
      const { botUrl } = await startBotAppLoginSession({ expoHost });
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
      setError("Telegram Login работает только с HTTPS. Задайте telegramLoginOrigin в app.json.");
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

  async function handleManualCodeSubmit() {
    setError(null);
    const t = extractMobileLoginToken(manualCode.trim());
    if (!t) {
      setError("Вставьте полную ссылку из браузера или только длинный код из неё");
      return;
    }
    setLoading(true);
    try {
      const data = await exchangeMagicLinkToken(t);
      await Promise.resolve(onAuthenticated(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  if (step === "email-sent") {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <GlassCard style={styles.card}>
              <View style={styles.cardInner}>
                <View style={styles.sentIcon}>
                  <FluidText variant="displayLg" color={colors.tertiary}>✉</FluidText>
                </View>
                <FluidText variant="headlineSm" color={colors.onSurface} style={styles.textCenter}>
                  Проверьте почту
                </FluidText>
                <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={[styles.textCenter, styles.mt8]}>
                  Мы отправили ссылку для входа на{"\n"}
                  <FluidText variant="titleSm" color={colors.primary}>{email}</FluidText>
                </FluidText>
                <FluidText variant="bodySm" color={colors.outline} style={[styles.textCenter, styles.mt12]}>
                  Откройте ссылку на этом устройстве — вы войдёте автоматически. Ссылка действительна 15 минут.
                </FluidText>
                <FluidButton
                  title="Изменить email"
                  variant="ghost"
                  onPress={() => { setStep("input"); setEmail(""); setError(null); }}
                  style={styles.mt20}
                />
              </View>
            </GlassCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MeshBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={styles.logoIcon}>
              <IconDarkSvg width={48} height={48} />
            </View>
            <FluidText variant="headlineLg" color={colors.primary} style={styles.logoText}>
              МойСоюз
            </FluidText>
          </View>

          {/* Glass Card */}
          <GlassCard style={styles.card}>
            <View style={styles.cardInner}>
              <FluidText variant="headlineSm" color={colors.onSurface}>
                Добро пожаловать
              </FluidText>
              <FluidText variant="bodySm" color={colors.onSurfaceVariant} style={styles.mt4}>
                Войдите, чтобы продолжить
              </FluidText>

              {error ? (
                <View style={styles.errorBanner}>
                  <FluidText variant="bodySm" color={colors.error}>{error}</FluidText>
                </View>
              ) : null}

              {/* Email */}
              <FluidInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@example.com"
                style={styles.mt20}
              />

              <FluidButton
                title="Получить ссылку"
                onPress={handleEmailSubmit}
                loading={loading}
                disabled={loading}
                style={styles.mt16}
              />

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <FluidText variant="labelSm" color={colors.outline} style={styles.dividerText}>или</FluidText>
                <View style={styles.dividerLine} />
              </View>

              {/* Telegram buttons */}
              <FluidButton
                title="Войти с Telegram"
                variant="surface"
                onPress={() => void handleBotLogin()}
                loading={loading}
                disabled={loading}
                icon={<FluidText variant="titleSm" color={colors.tertiary}>✈</FluidText>}
              />

              <Pressable
                onPress={startTelegramLoginFlow}
                disabled={loading}
                style={({ pressed }) => [styles.ghostLink, pressed && { opacity: 0.7 }]}
              >
                <FluidText variant="bodySm" color={colors.onSurfaceVariant}>
                  Или через{" "}
                  <FluidText variant="bodySm" color={colors.primary}>сайт Telegram</FluidText>
                </FluidText>
              </Pressable>

              {isExpoGo && !showManualInput ? (
                <FluidText variant="bodySm" color={colors.tertiary} style={[styles.textCenter, styles.mt16]}>
                  В Expo Go ссылка myunion:// из Safari часто не возвращает в приложение. После кнопки в бота вставьте ссылку или код ниже.
                </FluidText>
              ) : null}

              {!showManualInput ? (
                <Pressable 
                  onPress={() => setShowManualInput(true)} 
                  style={({ pressed }) => [styles.ghostLink, pressed && { opacity: 0.7 }, { marginTop: spacing.md }]}
                >
                  <FluidText variant="labelSm" color={colors.onSurfaceVariant} style={styles.textCenter}>
                    Не открывается приложение после бота?
                  </FluidText>
                </Pressable>
              ) : (
                <View style={styles.manualInputCard}>
                  <View style={styles.manualInputHeader}>
                    <FluidText variant="labelSm" color={colors.onSurfaceVariant}>
                      Вход по коду из бота
                    </FluidText>
                    <Pressable onPress={() => setShowManualInput(false)} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
                      <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
                    </Pressable>
                  </View>
                  <FluidInput
                    label="Вставьте скопированную ссылку или код"
                    value={manualCode}
                    onChangeText={setManualCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://myunion.pro/m?t=…"
                    multiline
                    style={styles.mt8}
                  />
                  <FluidButton
                    title="Войти"
                    variant="surface"
                    onPress={() => void handleManualCodeSubmit()}
                    loading={loading}
                    disabled={loading || !manualCode.trim()}
                    style={styles.mt12}
                  />
                </View>
              )}

              <FluidText variant="bodySm" color={colors.outline} style={[styles.textCenter, styles.mt20]}>
                Нет аккаунта? Регистрация автоматическая при первом входе.
              </FluidText>
            </View>
          </GlassCard>

          {/* Footer */}
          <View style={styles.footer}>
            <FluidText variant="labelSm" color={colors.outline}>
              Условия использования · Конфиденциальность
            </FluidText>
          </View>

          {/* Telegram Guide Modal */}
          <Modal
            visible={telegramGuideVisible}
            animationType="fade"
            transparent
            onRequestClose={() => setTelegramGuideVisible(false)}
          >
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setTelegramGuideVisible(false)}
            >
              <GlassCard style={styles.modalCard} borderRadius={radii["3xl"]}>
                <Pressable onPress={(e) => e.stopPropagation()}>
                  <View style={styles.modalInner}>
                    <FluidText variant="titleLg" color={colors.onSurface}>
                      Вход через Telegram
                    </FluidText>
                    <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                      <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={styles.mt12}>
                        Telegram не даёт приложениям открыть вас сразу — токен передаётся через браузер. Не закрывайте вкладку Safari.
                      </FluidText>
                      <FluidText variant="titleSm" color={colors.onSurface} style={styles.mt16}>
                        Как это работает
                      </FluidText>
                      <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={styles.mt8}>
                        1. Откроется Safari со страницей Telegram.
                      </FluidText>
                      <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={styles.mt4}>
                        2. Telegram может прислать запрос на авторизацию — нажмите «Принять».
                      </FluidText>
                      <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={styles.mt4}>
                        3. Вернитесь в Safari — страница перенаправит в МойСоюз.
                      </FluidText>
                    </ScrollView>
                    <View style={styles.modalActions}>
                      <FluidButton
                        title="Отмена"
                        variant="ghost"
                        onPress={() => setTelegramGuideVisible(false)}
                      />
                      <FluidButton
                        title="Открыть"
                        onPress={() => void launchTelegramOAuth()}
                      />
                    </View>
                  </View>
                </Pressable>
              </GlassCard>
            </Pressable>
          </Modal>

          {loading && (
            <View style={styles.overlayLoader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function MeshBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[colors.surface, "#101830", colors.surface]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(79,70,229,0.15)", "transparent"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.6 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}
      />
      <LinearGradient
        colors={["rgba(76,215,246,0.08)", "transparent"]}
        start={{ x: 0.8, y: 0.2 }}
        end={{ x: 0.2, y: 0.8 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing["3xl"],
    paddingVertical: spacing["4xl"],
  },
  logoWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing["4xl"],
    gap: spacing.lg,
  },
  logoIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontFamily: fonts.headlineExtrabold,
    letterSpacing: -0.5,
  },
  card: {
    paddingHorizontal: spacing["3xl"],
    paddingVertical: spacing["4xl"],
  },
  cardInner: {},
  mt4: { marginTop: 4 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  mt20: { marginTop: 20 },
  textCenter: { textAlign: "center" },
  errorBanner: {
    marginTop: spacing.xl,
    backgroundColor: colors.errorContainer,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing["3xl"],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.outlineVariant,
    opacity: 0.3,
  },
  dividerText: { paddingHorizontal: spacing.lg },
  ghostLink: {
    alignSelf: "center",
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  footer: {
    alignItems: "center",
    marginTop: spacing["4xl"],
  },
  sentIcon: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11,19,38,0.8)",
    justifyContent: "center",
    paddingHorizontal: spacing["3xl"],
  },
  modalCard: {
    maxHeight: "80%",
  },
  modalInner: {
    padding: spacing["3xl"],
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.lg,
    marginTop: spacing["3xl"],
  },
  overlayLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,19,38,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  manualInputCard: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  manualInputHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
});
