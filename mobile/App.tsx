import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
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
  getHealthStatus,
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
const IS_WEB = Platform.OS === "web";

const Tab = createBottomTabNavigator();

async function safeGetItem(key: string) {
  if (IS_WEB && typeof window !== "undefined") return window.localStorage.getItem(key);
  try {
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}
async function safeSetItem(key: string, value: string) {
  if (IS_WEB && typeof window !== "undefined") { window.localStorage.setItem(key, value); return; }
  try { const SecureStore = await import("expo-secure-store"); await SecureStore.setItemAsync(key, value); } catch {}
}
async function safeDeleteItem(key: string) {
  if (IS_WEB && typeof window !== "undefined") { window.localStorage.removeItem(key); return; }
  try { const SecureStore = await import("expo-secure-store"); await SecureStore.deleteItemAsync(key); } catch {}
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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
      setMessages((prev) => prev.some((item) => item.id === msg.id) ? prev : [...prev, msg]);
    });
    return () => { socket.removeAllListeners("message:new"); };
  }, [accessToken]);

  useEffect(() => { if (accessToken) void loadChats(); }, [accessToken]);

  async function loadChats(options?: { bypassCache?: boolean }) {
    if (!accessToken) return;
    setLoadingChats(true);
    setError(null);
    try { const data = await getChats(accessToken, { bypassCache: options?.bypassCache }); setChats(data.chats || []); }
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
    try {
      const data = await getChatThread(accessToken, chat.id);
      setMessages(data.messages || []);
      getSocket()?.emit("chat:join", chat.id);
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
    await Promise.all([safeDeleteItem(TOKEN_KEY), safeDeleteItem(USER_ID_KEY), safeDeleteItem(USER_DATA_KEY)]);
  }

  async function sendMessage() {
    if (!messageInput.trim() || !selectedChat) return;
    const content = messageInput.trim();
    setMessageInput("");
    const socket = getSocket();
    if (!socket?.connected) { setError("Socket disconnected"); return; }
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: ChatMessageItem = {
      id: optimisticId, chatId: selectedChat.id, senderId: currentUserId || "",
      content, messageType: "text", createdAt: new Date().toISOString(),
      sender: { id: currentUserId || "", firstName: "Вы", lastName: null, avatarUrl: null },
    };
    setMessages((prev) => [...prev, optimistic]);
    socket.emit("message:send", { chatId: selectedChat.id, content }, (response) => {
      if (!response.success) {
        setError(response.error || "Failed to send message");
        setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      }
    });
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
        onBack={() => {}}
      />
    );
  }

  function ProfileTab() {
    return <ProfileScreen user={currentUser} onNavigateToSettings={() => setShowSettings(true)} />;
  }

  return (
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
