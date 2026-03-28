import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Appbar,
  IconButton,
  PaperProvider,
  Surface,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { appConfig } from "./src/config/appConfig";
import { decodeMobileJwtPayload } from "./src/lib/decodeMobileJwt";
import {
  exchangeMagicLinkToken,
  getChatThread,
  getChats,
  getHealthStatus,
  type MobileAuthSuccess,
} from "./src/services/chatApi";
import { connectSocket, disconnectSocket, getSocket } from "./src/services/socketClient";
import type { ChatMessageItem, MobileChat } from "./src/types/chat";
import { getChatDisplayName } from "./src/lib/chatCategorization";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { myUnionPaperTheme } from "./src/theme/paperTheme";

const TOKEN_KEY = "myunion.mobile.token";
const USER_ID_KEY = "myunion.mobile.user-id";
const IS_WEB = Platform.OS === "web";

async function safeGetItem(key: string) {
  if (IS_WEB && typeof window !== "undefined") {
    return window.localStorage.getItem(key);
  }

  try {
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function safeSetItem(key: string, value: string) {
  if (IS_WEB && typeof window !== "undefined") {
    window.localStorage.setItem(key, value);
    return;
  }

  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(key, value);
    return;
  } catch {
    // noop
  }
}

async function safeDeleteItem(key: string) {
  if (IS_WEB && typeof window !== "undefined") {
    window.localStorage.removeItem(key);
    return;
  }

  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.deleteItemAsync(key);
    return;
  } catch {
    // noop
  }
}

function AppContent() {
  const theme = useTheme();
  const [bootLoading, setBootLoading] = useState(true);
  const [health, setHealth] = useState<string>("Checking backend...");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<MobileChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selectedChat, setSelectedChat] = useState<MobileChat | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");

  const selectedChatRef = useRef<MobileChat | null>(null);

  useEffect(() => {
    if (IS_WEB) {
      setHealth("Backend check skipped on web (CORS)");
      return;
    }

    getHealthStatus()
      .then((data) => {
        const status = typeof data?.status === "string" ? data.status : "ok";
        setHealth(`Backend: ${status}`);
      })
      .catch(() => {
        setHealth("Backend: unavailable");
      });
  }, []);

  const persistAuth = useCallback(async (data: MobileAuthSuccess) => {
    setAccessToken(data.accessToken);
    setCurrentUserId(data.user.id);
    setError(null);
    await Promise.all([
      safeSetItem(TOKEN_KEY, data.accessToken),
      safeSetItem(USER_ID_KEY, data.user.id),
    ]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [token, userId] = await Promise.all([
          safeGetItem(TOKEN_KEY),
          safeGetItem(USER_ID_KEY),
        ]);
        if (token) setAccessToken(token);
        if (userId) setCurrentUserId(userId);
      } catch (err) {
        console.warn("[mobile] token bootstrap failed:", err);
      }
      setBootLoading(false);
    })();
  }, []);

  useEffect(() => {
    function consumeAuthDeepLink(url: string | null) {
      if (!url) return;

      if (url.includes("loginToken=")) {
        const m = url.match(/loginToken=([^&]+)/);
        const loginToken = m ? decodeURIComponent(m[1]) : null;
        if (!loginToken) return;
        void exchangeMagicLinkToken(loginToken)
          .then((data) => persistAuth(data))
          .catch((e) => {
            setError(e instanceof Error ? e.message : "Ошибка входа");
          });
        if (IS_WEB && typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }
        return;
      }

      if (!url.includes("accessToken=")) return;
      const m = url.match(/accessToken=([^&]+)/);
      const token = m ? decodeURIComponent(m[1]) : null;
      if (!token) return;
      const p = decodeMobileJwtPayload(token);
      if (!p?.sub) return;
      void persistAuth({
        accessToken: token,
        user: {
          id: p.sub,
          email: p.email ?? null,
          role: p.role || "MEMBER",
          firstName: null,
          lastName: null,
          avatarUrl: null,
        },
      });
      if (IS_WEB && typeof window !== "undefined") {
        const clean = window.location.pathname;
        window.history.replaceState(null, "", clean);
      }
    }

    if (IS_WEB && typeof window !== "undefined") {
      consumeAuthDeepLink(window.location.href);
    }
    const sub = Linking.addEventListener("url", ({ url }) => consumeAuthDeepLink(url));
    void Linking.getInitialURL().then(consumeAuthDeepLink);
    return () => sub.remove();
  }, [persistAuth]);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    if (!accessToken) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(accessToken);
    socket.on("message:new", (message: unknown) => {
      const msg = message as ChatMessageItem;
      const active = selectedChatRef.current;
      if (!active || msg.chatId !== active.id) return;

      setMessages((prev) => {
        if (prev.some((item) => item.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      socket.removeAllListeners("message:new");
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadChats();
  }, [accessToken]);

  async function loadChats(options?: { bypassCache?: boolean }) {
    if (!accessToken) return;
    setLoadingChats(true);
    setError(null);
    try {
      const data = await getChats(accessToken, { bypassCache: options?.bypassCache });
      setChats(data.chats || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chats");
    } finally {
      setLoadingChats(false);
    }
  }

  async function openChat(chat: MobileChat) {
    if (!accessToken) return;
    setSelectedChat(chat);
    setLoadingMessages(true);
    setError(null);
    setMessages([]);
    try {
      const data = await getChatThread(accessToken, chat.id);
      setMessages(data.messages || []);
      const socket = getSocket();
      socket?.emit("chat:join", chat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleLogout() {
    disconnectSocket();
    setAccessToken(null);
    setCurrentUserId(null);
    setSelectedChat(null);
    setMessages([]);
    setChats([]);
    await Promise.all([safeDeleteItem(TOKEN_KEY), safeDeleteItem(USER_ID_KEY)]);
  }

  async function sendMessage() {
    if (!messageInput.trim() || !selectedChat) return;
    const content = messageInput.trim();
    setMessageInput("");

    const socket = getSocket();
    if (!socket?.connected) {
      setError("Socket disconnected");
      return;
    }

    const optimisticId = `tmp-${Date.now()}`;
    const optimisticMessage: ChatMessageItem = {
      id: optimisticId,
      chatId: selectedChat.id,
      senderId: currentUserId || "",
      content,
      messageType: "text",
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId || "",
        firstName: "Вы",
        lastName: null,
        avatarUrl: null,
      },
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    socket.emit("message:send", { chatId: selectedChat.id, content }, (response) => {
      if (!response.success) {
        setError(response.error || "Failed to send message");
        setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      }
    });
  }

  const threadTitle = useMemo(() => {
    if (!selectedChat) return "";
    return getChatDisplayName(selectedChat, currentUserId);
  }, [selectedChat, currentUserId]);

  const safeEdges = ["top", "left", "right", "bottom"] as const;

  if (bootLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={[...safeEdges]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Загрузка…
          </Text>
        </View>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (!accessToken) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={[...safeEdges]}>
        <LoginScreen onAuthenticated={persistAuth} />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (selectedChat) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={[...safeEdges]}>
        <Appbar.Header elevated>
          <Appbar.BackAction onPress={() => setSelectedChat(null)} />
          <Appbar.Content title={threadTitle} titleStyle={{ fontSize: 18 }} />
        </Appbar.Header>
        {!IS_WEB ? (
          <Text variant="labelSmall" style={[styles.healthSmall, { color: theme.colors.onSurfaceVariant }]}>
            {health}
          </Text>
        ) : null}
        {loadingMessages ? (
          <ActivityIndicator style={{ marginVertical: 12 }} />
        ) : null}
        <FlatList
          style={styles.threadList}
          contentContainerStyle={styles.threadListContent}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isMine = item.senderId === currentUserId;
            return (
              <Surface
                style={[
                  styles.bubble,
                  isMine
                    ? { alignSelf: "flex-end", backgroundColor: theme.colors.primaryContainer }
                    : { alignSelf: "flex-start", backgroundColor: theme.colors.surfaceVariant },
                ]}
                elevation={1}
              >
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                  {isMine
                    ? "Вы"
                    : `${item.sender.firstName || ""} ${item.sender.lastName || ""}`.trim() || "Участник"}
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {item.content}
                </Text>
              </Surface>
            );
          }}
        />
        <Surface
          style={[styles.composeBar, { borderTopColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}
          elevation={2}
        >
          <TextInput
            mode="outlined"
            multiline
            dense
            style={styles.composeInput}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Сообщение…"
            maxLength={8000}
          />
          <IconButton
            icon="send"
            mode="contained"
            disabled={!messageInput.trim()}
            onPress={sendMessage}
            accessibilityLabel="Отправить"
          />
        </Surface>
        {error ? (
          <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
            {error}
          </Text>
        ) : null}
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={[...safeEdges]}>
      {!IS_WEB ? (
        <Text variant="labelSmall" style={[styles.healthBanner, { color: theme.colors.primary }]}>
          {health} · {appConfig.apiBaseUrl}
        </Text>
      ) : null}
      <ChatsScreen
        accessToken={accessToken}
        chats={chats}
        loading={loadingChats}
        currentUserId={currentUserId}
        selectedChatId={null}
        onRefresh={loadChats}
        onSelectChat={openChat}
        onLogout={handleLogout}
      />
      {error ? (
        <Text variant="bodySmall" style={[styles.errorFloating, { color: theme.colors.error }]}>
          {error}
        </Text>
      ) : null}
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={myUnionPaperTheme}>
        <AppContent />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  healthBanner: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
    fontWeight: "600",
  },
  healthSmall: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  threadList: { flex: 1 },
  threadListContent: { paddingHorizontal: 16, paddingVertical: 8, paddingBottom: 16 },
  bubble: {
    maxWidth: "88%",
    padding: 12,
    marginBottom: 10,
    borderRadius: 16,
  },
  composeBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composeInput: {
    flex: 1,
    maxHeight: 120,
    marginBottom: 4,
  },
  errorText: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontWeight: "500",
  },
  errorFloating: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontWeight: "500",
  },
});
