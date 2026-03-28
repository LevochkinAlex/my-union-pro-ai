import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { MobileChat } from "../types/chat";
import {
  categorizeChats,
  displayedChatsForTab,
  getChatDisplayName,
  isChairmanViewMode,
  type SidebarTab,
} from "../lib/chatCategorization";
import { getViewMode } from "../services/chatApi";
import { FluidText, FluidAvatar } from "../components/ui";
import { colors, fonts, radii, spacing } from "../theme/tokens";

type Props = {
  accessToken: string;
  chats: MobileChat[];
  loading: boolean;
  currentUserId: string | null;
  selectedChatId: string | null;
  onRefresh: (opts?: { bypassCache?: boolean }) => void;
  onSelectChat: (chat: MobileChat) => void;
  onLogout: () => void;
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "сейчас";
  if (diffMin < 60) return `${diffMin} мин`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} д`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function ChatListScreen({
  accessToken,
  chats,
  loading,
  currentUserId,
  selectedChatId,
  onRefresh,
  onSelectChat,
  onLogout,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SidebarTab>("all");
  const [chairmanTabs, setChairmanTabs] = useState(false);
  const [viewModeLoading, setViewModeLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getViewMode(accessToken);
        if (cancelled) return;
        const mode = data.currentMode ?? data.viewMode;
        setChairmanTabs(isChairmanViewMode(mode));
      } catch {
        if (!cancelled) setChairmanTabs(false);
      } finally {
        if (!cancelled) setViewModeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken]);

  const buckets = useMemo(
    () => categorizeChats(chats, searchQuery, currentUserId),
    [chats, searchQuery, currentUserId],
  );

  const displayed = useMemo(
    () => displayedChatsForTab(activeTab, buckets),
    [activeTab, buckets],
  );

  const tabItems: { key: SidebarTab; label: string }[] = chairmanTabs
    ? [
        { key: "all", label: "Все" },
        { key: "work", label: "Рабочие" },
        { key: "personal", label: "Личные" },
        { key: "archived", label: "Архив" },
      ]
    : [
        { key: "all", label: "Все" },
        { key: "archived", label: "Архив" },
      ];

  function handleTabChange(key: SidebarTab) {
    setActiveTab(key);
    if (key === "archived") onRefresh({ bypassCache: true });
  }

  const { ai, support, work, personal, channels, archived } = displayed;
  const hasAnyChats =
    !!ai || !!support || work.length > 0 || personal.length > 0 || channels.length > 0 || archived.length > 0;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <FluidAvatar name="U" size={36} rounded="full" ringColor={colors.primary} />
          <FluidText variant="titleLg" color={colors.primary} style={styles.headerTitle}>
            МойСоюз
          </FluidText>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => onRefresh()} style={styles.iconBtn}>
            <MaterialCommunityIcons name="refresh" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
          <Pressable onPress={onLogout} style={styles.iconBtn}>
            <MaterialCommunityIcons name="logout" size={22} color={colors.error} />
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.outline} />
          <TextInput
            placeholder="Поиск чатов…"
            placeholderTextColor={colors.outline}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
            selectionColor={colors.primary}
          />
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {tabItems.map(({ key, label }) => {
          const active = activeTab === key;
          return (
            <Pressable
              key={key}
              onPress={() => handleTabChange(key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <FluidText
                variant="labelMd"
                color={active ? colors.white : colors.onSurfaceVariant}
                style={active ? { fontFamily: fonts.bodySemibold } : undefined}
              >
                {label}
              </FluidText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Chat List */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {loading && chats.length === 0 ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <FluidText variant="bodyMd" color={colors.outline} style={{ marginTop: 12 }}>
              Загрузка чатов…
            </FluidText>
          </View>
        ) : !hasAnyChats ? (
          <View style={styles.emptyWrap}>
            <FluidText variant="displayLg" color={colors.outline}>💬</FluidText>
            <FluidText variant="bodyLg" color={colors.outline} style={{ marginTop: 8, textAlign: "center" }}>
              Нет чатов
            </FluidText>
          </View>
        ) : (
          <>
            {/* Pinned bento cards */}
            {(ai || support) && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pinnedScroll}
                contentContainerStyle={styles.pinnedRow}
              >
                {ai && (
                  <Pressable onPress={() => onSelectChat(ai)} style={({ pressed }) => [pressed && styles.pressed]}>
                    <LinearGradient
                      colors={[colors.gradientStart, "#7c3aed"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.bentoCard}
                    >
                      <FluidText variant="headlineSm" color={colors.white}>✦</FluidText>
                      <FluidText variant="titleSm" color={colors.white} style={{ marginTop: 8 }}>
                        ИИ-Ассистент
                      </FluidText>
                      <FluidText variant="bodySm" color="rgba(255,255,255,0.7)" style={{ marginTop: 4 }}>
                        Помощник
                      </FluidText>
                    </LinearGradient>
                  </Pressable>
                )}
                {support && (
                  <Pressable onPress={() => onSelectChat(support)} style={({ pressed }) => [pressed && styles.pressed]}>
                    <LinearGradient
                      colors={["#0e7c9e", colors.tertiary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.bentoCard}
                    >
                      <FluidText variant="headlineSm" color={colors.white}>?</FluidText>
                      <FluidText variant="titleSm" color={colors.white} style={{ marginTop: 8 }}>
                        Техподдержка
                      </FluidText>
                      <FluidText variant="bodySm" color="rgba(255,255,255,0.7)" style={{ marginTop: 4 }}>
                        Помощь
                      </FluidText>
                    </LinearGradient>
                  </Pressable>
                )}
              </ScrollView>
            )}

            {channels.length > 0 && (
              <>
                <SectionHeader label="Каналы" />
                {channels.map((c) => (
                  <ChannelRow
                    key={c.id}
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                  />
                ))}
              </>
            )}

            {work.length > 0 && (
              <>
                <SectionHeader label="Рабочие" />
                {work.map((c) => (
                  <ChatRow
                    key={c.id}
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                  />
                ))}
              </>
            )}

            {personal.length > 0 && (
              <>
                <SectionHeader label="Личные" />
                {personal.map((c) => (
                  <ChatRow
                    key={c.id}
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                  />
                ))}
              </>
            )}

            {archived.length > 0 && (
              <>
                <SectionHeader label="Архив" />
                {archived.map((c) => (
                  <ChatRow
                    key={c.id}
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                    dimmed
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <FluidText variant="labelMd" color={colors.onSurfaceVariant} style={styles.sectionHeader}>
      {label.toUpperCase()}
    </FluidText>
  );
}

function ChannelRow({
  chat,
  currentUserId,
  selected,
  onPress,
}: {
  chat: MobileChat;
  currentUserId: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const title = getChatDisplayName(chat, currentUserId);
  const unread = (chat.unreadCount ?? 0) > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chatRow,
        selected && styles.chatRowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.channelIcon}>
        <FluidText variant="titleSm" color={colors.primary}>#</FluidText>
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatTopLine}>
          <FluidText
            variant="titleSm"
            color={colors.onSurface}
            numberOfLines={1}
            style={[styles.chatName, unread && { fontFamily: fonts.headline }]}
          >
            {title}
          </FluidText>
          {chat.lastMessageAt && (
            <FluidText variant="labelSm" color={unread ? colors.primary : colors.outline}>
              {formatRelativeTime(chat.lastMessageAt)}
            </FluidText>
          )}
        </View>
        <FluidText variant="bodySm" color={colors.onSurfaceVariant} numberOfLines={1} style={styles.preview}>
          {chat.lastMessage?.trim() || "Нет сообщений"}
        </FluidText>
      </View>
      {unread && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

function ChatRow({
  chat,
  currentUserId,
  selected,
  onPress,
  dimmed,
}: {
  chat: MobileChat;
  currentUserId: string | null;
  selected: boolean;
  onPress: () => void;
  dimmed?: boolean;
}) {
  const title = getChatDisplayName(chat, currentUserId);
  const unread = (chat.unreadCount ?? 0) > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chatRow,
        selected && styles.chatRowSelected,
        pressed && styles.pressed,
        dimmed && { opacity: 0.5 },
      ]}
    >
      <FluidAvatar
        uri={chat.otherUser?.avatarUrl}
        name={title}
        size={44}
        rounded="full"
      />
      <View style={styles.chatInfo}>
        <View style={styles.chatTopLine}>
          <FluidText
            variant="titleSm"
            color={colors.onSurface}
            numberOfLines={1}
            style={[styles.chatName, unread && { fontFamily: fonts.headline }]}
          >
            {title}
          </FluidText>
          {chat.lastMessageAt && (
            <FluidText variant="labelSm" color={unread ? colors.primary : colors.outline}>
              {formatRelativeTime(chat.lastMessageAt)}
            </FluidText>
          )}
        </View>
        <FluidText variant="bodySm" color={colors.onSurfaceVariant} numberOfLines={1} style={styles.preview}>
          {chat.lastMessage?.trim() || "Нет сообщений"}
        </FluidText>
      </View>
      {unread && (
        <View style={styles.unreadBadge}>
          <FluidText variant="labelSm" color={colors.white}>
            {(chat.unreadCount ?? 0) > 99 ? "99+" : chat.unreadCount}
          </FluidText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  headerTitle: { fontFamily: fonts.headlineExtrabold, letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
    paddingHorizontal: spacing.xl,
    height: 44,
    gap: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 15,
    padding: 0,
  },
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.primaryContainer,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing["5xl"] },
  pinnedScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  pinnedRow: {
    flexDirection: "row",
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  bentoCard: {
    width: 140,
    height: 130,
    borderRadius: radii["2xl"],
    padding: spacing.xl,
    justifyContent: "flex-end",
  },
  sectionHeader: {
    marginTop: spacing["2xl"],
    marginBottom: spacing.lg,
    marginLeft: spacing.sm,
    fontFamily: fonts.bodySemibold,
    letterSpacing: 0.8,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.xl,
    marginBottom: spacing.sm,
  },
  chatRowSelected: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  pressed: { opacity: 0.85 },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  chatInfo: { flex: 1, marginLeft: spacing.lg },
  chatTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatName: { flex: 1, marginRight: spacing.md },
  preview: { marginTop: 2 },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginLeft: spacing.md,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    marginLeft: spacing.md,
  },
  emptyWrap: {
    paddingTop: 80,
    alignItems: "center",
    justifyContent: "center",
  },
});
