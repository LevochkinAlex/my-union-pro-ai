import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import { useFonts, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { appConfig } from "./src/config/appConfig";
import { decodeMobileJwtPayload } from "./src/lib/decodeMobileJwt";
import { extractMobileLoginToken } from "./src/lib/extractMobileLoginToken";
import { getChatDisplayName } from "./src/lib/chatCategorization";
import {
  exchangeMagicLinkToken,
  getChatThread,
  getChats,
  uploadChatAttachment,
  type MobileAuthSuccess,
  type MobileAuthUser,
} from "./src/services/chatApi";
import { connectSocket, disconnectSocket, getSocket } from "./src/services/socketClient";
import type { ChatMessageItem, MobileChat } from "./src/types/chat";
import { FluidText } from "./src/components/ui";
import { colors, spacing, radii } from "./src/theme/tokens";

import { LoginScreen } from "./src/screens/LoginScreen";
import { ChatListScreen } from "./src/screens/ChatListScreen";
import { ChatThreadScreen } from "./src/screens/ChatThreadScreen";
import { AIBotChatScreen } from "./src/screens/AIBotChatScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { WorkspaceBrowserScreen } from "./src/screens/WorkspaceBrowserScreen";

const TOKEN_KEY = "myunion.mobile.token";
const USER_ID_KEY = "myunion.mobile.user-id";
const USER_DATA_KEY = "myunion.mobile.user-data";
const CHATS_CACHE_KEY = "myunion.mobile.chats-cache";
const IS_WEB = Platform.OS === "web";

/** Keys that can exceed SecureStore size limits — keep in AsyncStorage (native) / localStorage (web). */
const ASYNC_PERSIST_KEYS = new Set<string>([CHATS_CACHE_KEY, USER_DATA_KEY]);

const Tab = createBottomTabNavigator();

async function safeGetItem(key: string) {
  if (IS_WEB && typeof window !== "undefined") return window.localStorage.getItem(key);
  try {
    if (ASYNC_PERSIST_KEYS.has(key)) {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      return await AsyncStorage.getItem(key);
    }
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}
async function safeSetItem(key: string, value: string) {
  if (IS_WEB && typeof window !== "undefined") { window.localStorage.setItem(key, value); return; }
  try {
    if (ASYNC_PERSIST_KEYS.has(key)) {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.setItem(key, value);
      return;
    }
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(key, value);
  } catch {}
}
async function safeDeleteItem(key: string) {
  if (IS_WEB && typeof window !== "undefined") { window.localStorage.removeItem(key); return; }
  try {
    if (ASYNC_PERSIST_KEYS.has(key)) {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      await AsyncStorage.removeItem(key);
      return;
    }
    const SecureStore = await import("expo-secure-store");
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

/** One-time: move large payloads out of SecureStore (older builds) to stop 2048-byte warnings. */
async function migrateLegacySecureStoreLargeKeys() {
  if (IS_WEB) return;
  try {
    const SecureStore = await import("expo-secure-store");
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    for (const key of ASYNC_PERSIST_KEYS) {
      const legacy = await SecureStore.getItemAsync(key);
      if (!legacy) continue;
      const current = await AsyncStorage.getItem(key);
      if (!current) await AsyncStorage.setItem(key, legacy);
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // ignore
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function normalizeMessage(raw: ChatMessageItem): ChatMessageItem {
  return {
    ...raw,
    content: typeof raw?.content === "string" ? raw.content : String(raw?.content || ""),
    sender: raw?.sender || {
      id: raw?.senderId || "unknown",
      firstName: "Пользователь",
      lastName: null,
      avatarUrl: null,
    },
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
    reactions: Array.isArray(raw?.reactions) ? raw.reactions : [],
    readBy: Array.isArray(raw?.readBy) ? raw.readBy : [],
    replyTo: raw?.replyTo && raw.replyTo.sender ? raw.replyTo : null,
  };
}

function AppContent() {
  const [bootLoading, setBootLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<MobileAuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<MobileChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selectedChat, setSelectedChat] = useState<MobileChat | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessageItem | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const selectedChatRef = useRef<MobileChat | null>(null);

  const persistAuth = useCallback(async (data: MobileAuthSuccess) => {
    setAccessToken(data.accessToken);
    setCurrentUserId(data.user.id);
    setCurrentUser(data.user);
    setError(null);
    await Promise.all([
      safeSetItem(TOKEN_KEY, data.accessToken),
      safeSetItem(USER_ID_KEY, data.user.id),
      safeSetItem(USER_DATA_KEY, JSON.stringify(data.user)),
    ]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await migrateLegacySecureStoreLargeKeys();
        const [token, userId, userData] = await Promise.all([
          safeGetItem(TOKEN_KEY),
          safeGetItem(USER_ID_KEY),
          safeGetItem(USER_DATA_KEY),
        ]);
        if (token) setAccessToken(token);
        if (userId) setCurrentUserId(userId);
        if (userData) try { setCurrentUser(JSON.parse(userData)); } catch {}
      } catch (err) { console.warn("[mobile] token bootstrap failed:", err); }
      setBootLoading(false);
    })();
  }, []);

  useEffect(() => {
    function consumeAuthDeepLink(url: string | null) {
      if (!url) return;
      if (url.includes("accessToken=")) {
        const m = url.match(/accessToken=([^&]+)/);
        const token = m ? decodeURIComponent(m[1]) : null;
        if (!token) return;
        const p = decodeMobileJwtPayload(token);
        if (!p?.sub) return;
        void persistAuth({
          accessToken: token,
          user: { id: p.sub, email: p.email ?? null, role: p.role || "MEMBER", firstName: null, lastName: null, avatarUrl: null },
        });
        if (IS_WEB && typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      const loginToken = extractMobileLoginToken(url);
      if (loginToken) {
        void exchangeMagicLinkToken(loginToken)
          .then((data) => persistAuth(data))
          .catch((e) => setError(e instanceof Error ? e.message : "Ошибка входа"));
        if (IS_WEB && typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
      }
    }
    if (IS_WEB && typeof window !== "undefined") consumeAuthDeepLink(window.location.href);
    const sub = Linking.addEventListener("url", ({ url }) => consumeAuthDeepLink(url));
    void Linking.getInitialURL().then(consumeAuthDeepLink);
    return () => sub.remove();
  }, [persistAuth]);

  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

  useEffect(() => {
    if (!accessToken) { disconnectSocket(); return; }
    const socket = connectSocket(accessToken);
    
    socket.on("message:new", (message: unknown) => {
      const msg = message as ChatMessageItem;
      const active = selectedChatRef.current;
      if (!active || msg.chatId !== active.id) return;
      const normalized = normalizeMessage(msg);
      setMessages((prev) => prev.some((item) => item.id === normalized.id) ? prev : [...prev, normalized]);
      if (msg.senderId !== currentUserId) {
        socket.emit("read:mark", { chatId: active.id, messageId: msg.id });
      }
    });

    socket.on("message:updated", (message: unknown) => {
      const msg = message as ChatMessageItem;
      const normalized = normalizeMessage(msg);
      setMessages((prev) => prev.map((m) => m.id === normalized.id ? normalized : m));
    });

    socket.on("message:deleted", (data: { messageId: string }) => {
      if (!data?.messageId) return;
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    });

    socket.on("reaction:add", (data: { messageId: string; userId: string; emoji: string }) => {
      if (!data?.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== data.messageId
            ? m
            : {
                ...m,
                reactions: [...(m.reactions || []), { id: `${data.userId}:${data.emoji}`, userId: data.userId, emoji: data.emoji }],
              },
        ),
      );
    });

    socket.on("reaction:remove", (data: { messageId: string; userId: string; emoji: string }) => {
      if (!data?.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== data.messageId
            ? m
            : {
                ...m,
                reactions: (m.reactions || []).filter((r) => !(r.userId === data.userId && r.emoji === data.emoji)),
              },
        ),
      );
    });

    socket.on("read:update", (data: { chatId: string; userId: string; messageId: string }) => {
      const active = selectedChatRef.current;
      if (!active || data.chatId !== active.id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== data.messageId
            ? m
            : {
                ...m,
                readBy: [
                  ...(m.readBy || []).filter((rb) => rb.userId !== data.userId),
                  { userId: data.userId, readAt: new Date().toISOString() },
                ],
              },
        ),
      );
    });

    return () => { 
      socket.removeAllListeners("message:new"); 
      socket.removeAllListeners("message:updated"); 
      socket.removeAllListeners("message:deleted"); 
      socket.removeAllListeners("reaction:add"); 
      socket.removeAllListeners("reaction:remove"); 
      socket.removeAllListeners("read:update"); 
    };
  }, [accessToken, currentUserId]);

  useEffect(() => { if (accessToken) void loadChats(); }, [accessToken]);

  useEffect(() => {
    if (!currentUserId) return;
    void (async () => {
      try {
        const cachedRaw = await safeGetItem(CHATS_CACHE_KEY);
        if (!cachedRaw) return;
        const cached = JSON.parse(cachedRaw) as { userId: string; chats: MobileChat[] };
        if (cached.userId !== currentUserId || !Array.isArray(cached.chats)) return;
        if (chats.length === 0) {
          setChats(cached.chats);
        }
      } catch {
        // ignore malformed cache
      }
    })();
  }, [currentUserId]);

  async function loadChats(options?: { bypassCache?: boolean }) {
    if (!accessToken) return;
    setLoadingChats(true);
    setError(null);
    try {
      const data = await getChats(accessToken, { bypassCache: options?.bypassCache });
      const nextChats = data.chats || [];
      setChats(nextChats);
      if (currentUserId) {
        await safeSetItem(CHATS_CACHE_KEY, JSON.stringify({ userId: currentUserId, chats: nextChats }));
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load chats"); }
    finally { setLoadingChats(false); }
  }

  async function openChat(chat: MobileChat) {
    if (!accessToken) return;
    setSelectedChat(chat);
    setLoadingMessages(true);
    setError(null);
    setMessages([]);
    setMessageInput("");
    setReplyToMessage(null);
    try {
      const data = await getChatThread(accessToken, chat.id);
      setMessages((data.messages || []).map(normalizeMessage));
      getSocket()?.emit("chat:join", chat.id);
      const last = data.messages?.[data.messages.length - 1];
      if (last?.id) getSocket()?.emit("read:mark", { chatId: chat.id, messageId: last.id });
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load messages"); }
    finally { setLoadingMessages(false); }
  }

  async function handleLogout() {
    disconnectSocket();
    setAccessToken(null);
    setCurrentUserId(null);
    setCurrentUser(null);
    setSelectedChat(null);
    setMessages([]);
    setChats([]);
    await Promise.all([
      safeDeleteItem(TOKEN_KEY),
      safeDeleteItem(USER_ID_KEY),
      safeDeleteItem(USER_DATA_KEY),
      safeDeleteItem(CHATS_CACHE_KEY),
    ]);
  }

  async function sendMessage() {
    if (!messageInput.trim() || !selectedChat) return;
    const content = messageInput.trim();
    const replyToId = replyToMessage?.id || undefined;
    setMessageInput("");
    setReplyToMessage(null);
    const socket = getSocket();
    if (!socket?.connected) { setError("Socket disconnected"); return; }
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: ChatMessageItem = {
      id: optimisticId, chatId: selectedChat.id, senderId: currentUserId || "",
      content, messageType: "text", createdAt: new Date().toISOString(),
      sender: { id: currentUserId || "", firstName: "Вы", lastName: null, avatarUrl: null },
      replyTo: replyToMessage
        ? {
            id: replyToMessage.id,
            content: replyToMessage.content,
            sender: {
              firstName: replyToMessage.sender.firstName,
              lastName: replyToMessage.sender.lastName,
            },
          }
        : null,
    };
    setMessages((prev) => [...prev, optimistic]);
    socket.emit("message:send", { chatId: selectedChat.id, content, replyToId }, (response) => {
      if (!response.success) {
        setError(response.error || "Failed to send message");
        setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
        return;
      }
      const serverMsg = response.message as ChatMessageItem | undefined;
      if (serverMsg?.id) {
        setMessages((prev) => {
          const withoutTmp = prev.filter((item) => item.id !== optimisticId);
          return withoutTmp.some((item) => item.id === serverMsg.id) ? withoutTmp : [...withoutTmp, serverMsg];
        });
      }
    });
  }

  function handleToggleReaction(messageId: string, emoji: string) {
    const socket = getSocket();
    if (!socket?.connected) {
      setError("Socket disconnected");
      return;
    }
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const exists = (m.reactions || []).some((r) => r.userId === currentUserId && r.emoji === emoji);
        return {
          ...m,
          reactions: exists
            ? (m.reactions || []).filter((r) => !(r.userId === currentUserId && r.emoji === emoji))
            : [...(m.reactions || []), { id: `${currentUserId}:${emoji}`, userId: currentUserId || "", emoji }],
        };
      }),
    );
    socket.emit("reaction:toggle", { messageId, emoji });
  }

  async function handlePickImage() {
    if (!accessToken || !selectedChat) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Разрешите доступ к фото, чтобы отправлять вложения");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsMultipleSelection: false,
    });
    if (picked.canceled || !picked.assets?.length) return;

    try {
      const asset = picked.assets[0];
      const fileName = asset.fileName || `photo-${Date.now()}.jpg`;
      const mimeType = asset.mimeType || "image/jpeg";
      const message = await uploadChatAttachment(
        accessToken,
        selectedChat.id,
        { uri: asset.uri, name: fileName, type: mimeType },
        { replyToId: replyToMessage?.id || null },
      );
      setReplyToMessage(null);
      const normalized = normalizeMessage(message);
      setMessages((prev) => (prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить изображение");
    }
  }

  const threadTitle = useMemo(
    () => (selectedChat ? getChatDisplayName(selectedChat, currentUserId) : ""),
    [selectedChat, currentUserId],
  );

  const isAIChat = selectedChat?.isAIChat === true;

  if (bootLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: 12 }}>
          Загрузка…
        </FluidText>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!accessToken) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "left", "right", "bottom"]}>
        <LoginScreen onAuthenticated={persistAuth} />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (showSettings) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.surface }]} edges={["top", "left", "right", "bottom"]}>
        <SettingsScreen user={currentUser} onLogout={handleLogout} onBack={() => setShowSettings(false)} />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (selectedChat && isAIChat) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.surface }]} edges={["top", "left", "right", "bottom"]}>
        <AIBotChatScreen
          messages={messages}
          loadingMessages={loadingMessages}
          currentUserId={currentUserId}
          messageInput={messageInput}
          onChangeInput={setMessageInput}
          onSend={sendMessage}
          onPickImage={handlePickImage}
          onBack={() => setSelectedChat(null)}
        />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (selectedChat) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.surface }]} edges={["top", "left", "right", "bottom"]}>
        <ChatThreadScreen
          title={threadTitle}
          messages={messages}
          loadingMessages={loadingMessages}
          currentUserId={currentUserId}
          messageInput={messageInput}
          onChangeInput={setMessageInput}
          onSend={sendMessage}
          onPickImage={handlePickImage}
          onToggleReaction={handleToggleReaction}
          onReply={setReplyToMessage}
          replyToMessage={replyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
          onBack={() => setSelectedChat(null)}
        />
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  function HomeTab() {
    return (
      <ChatListScreen
        accessToken={accessToken!}
        chats={chats}
        loading={loadingChats}
        currentUserId={currentUserId}
        selectedChatId={null}
        onRefresh={loadChats}
        onSelectChat={openChat}
        onLogout={handleLogout}
      />
    );
  }

  function WorkspaceTab() {
    return <WorkspaceBrowserScreen />;
  }

  function AITab() {
    const aiChat = chats.find((c) => c.isAIChat);
    if (aiChat) {
      return (
        <View style={styles.flex}>
          <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={{ padding: spacing.xl, textAlign: "center" }}>
            Нажмите, чтобы открыть AI чат
          </FluidText>
        </View>
      );
    }
    return (
      <AIBotChatScreen
        messages={[]}
        loadingMessages={false}
        currentUserId={currentUserId}
        messageInput=""
        onChangeInput={() => {}}
        onSend={() => {}}
        onPickImage={() => {}}
        onBack={() => {}}
      />
    );
  }

  function ProfileTab() {
    return <ProfileScreen user={currentUser} onNavigateToSettings={() => setShowSettings(true)} />;
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "left", "right"]}>
      <NavigationContainer>
        <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.outline,
          tabBarLabelStyle: styles.tabBarLabel,
        }}
        >
          <Tab.Screen
          name="Home"
          component={HomeTab}
          options={{
            tabBarLabel: "Чаты",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="chat-outline" size={size} color={color} />
            ),
          }}
        />
          <Tab.Screen
          name="Workspaces"
          component={WorkspaceTab}
          options={{
            tabBarLabel: "Рабочие",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="view-grid-outline" size={size} color={color} />
            ),
          }}
        />
          <Tab.Screen
          name="AI"
          component={AITab}
          options={{
            tabBarLabel: "AI",
            tabBarIcon: ({ focused, size }) =>
              focused ? (
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, alignItems: "center", justifyContent: "center" }}
                >
                  <MaterialCommunityIcons name="robot-outline" size={size - 2} color={colors.white} />
                </LinearGradient>
              ) : (
                <MaterialCommunityIcons name="robot-outline" size={size} color={colors.outline} />
              ),
          }}
          listeners={{
            tabPress: (e) => {
              const aiChat = chats.find((c) => c.isAIChat);
              if (aiChat) {
                e.preventDefault();
                openChat(aiChat);
              }
            },
          }}
        />
          <Tab.Screen
          name="Profile"
          component={ProfileTab}
          options={{
            tabBarLabel: "Профиль",
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="account-outline" size={size} color={color} />
            ),
          }}
          />
        </Tab.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </SafeAreaView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabBar: {
    backgroundColor: colors.surfaceContainerLow,
    borderTopWidth: 0,
    height: 80,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    paddingTop: 8,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 -4px 20px rgba(0,0,0,0.3)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
          elevation: 20,
        }),
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
});
