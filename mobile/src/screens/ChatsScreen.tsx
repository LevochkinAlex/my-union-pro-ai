import { Fragment, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  List,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";
import type { MobileChat } from "../types/chat";
import {
  categorizeChats,
  displayedChatsForTab,
  getChatDisplayName,
  isChairmanViewMode,
  type SidebarTab,
} from "../lib/chatCategorization";
import { getViewMode } from "../services/chatApi";

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

function SectionTitle({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Text
      variant="labelLarge"
      style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}
      accessibilityRole="header"
    >
      {label}
    </Text>
  );
}

export function ChatsScreen({
  accessToken,
  chats,
  loading,
  currentUserId,
  selectedChatId,
  onRefresh,
  onSelectChat,
  onLogout,
}: Props) {
  const theme = useTheme();
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
    return () => {
      cancelled = true;
    };
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
    if (key === "archived") {
      onRefresh({ bypassCache: true });
    }
  }

  const { ai, support, work, personal, channels, archived } = displayed;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={styles.topBar}>
        <Text variant="headlineMedium" style={{ fontWeight: "700" }}>
          Чаты
        </Text>
        <Button mode="text" onPress={onLogout} compact>
          Выйти
        </Button>
      </View>

      <Searchbar
        placeholder="Поиск чатов..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.search}
        elevation={1}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {tabItems.map(({ key, label }) => (
          <Chip
            key={key}
            selected={activeTab === key}
            onPress={() => handleTabChange(key)}
            style={styles.chip}
            mode="flat"
            showSelectedOverlay
          >
            {label}
          </Chip>
        ))}
      </ScrollView>

      <View style={styles.refreshRow}>
        <Button mode="text" onPress={() => onRefresh()} loading={loading} disabled={loading}>
          Обновить
        </Button>
        {viewModeLoading ? (
          <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
            Режим…
          </Text>
        ) : null}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {displayed.ai ? (
          <>
            <SectionTitle label="ИИ" />
            <Card
              mode="elevated"
              style={[
                styles.specialCard,
                {
                  backgroundColor: theme.colors.tertiaryContainer,
                  borderColor: selectedChatId === displayed.ai.id ? theme.colors.primary : "transparent",
                  borderWidth: selectedChatId === displayed.ai.id ? 2 : 0,
                },
              ]}
              onPress={() => onSelectChat(displayed.ai!)}
            >
              <Card.Title
                title="ИИ-Ассистент"
                subtitle="Помощник по профсоюзным вопросам"
                titleStyle={{ color: theme.colors.onTertiaryContainer }}
                subtitleStyle={{ color: theme.colors.onTertiaryContainer, opacity: 0.85 }}
              />
            </Card>
          </>
        ) : (
          <>
            <SectionTitle label="ИИ" />
            <Text variant="bodyMedium" style={{ color: theme.colors.outline, marginBottom: 8 }}>
              Чат с ассистентом появится после синхронизации
            </Text>
          </>
        )}

        {support ? (
          <>
            <SectionTitle label="Техподдержка" />
            <Card
              mode="elevated"
              style={[
                styles.specialCard,
                {
                  backgroundColor: theme.colors.secondaryContainer,
                  borderColor: selectedChatId === support.id ? theme.colors.primary : "transparent",
                  borderWidth: selectedChatId === support.id ? 2 : 0,
                },
              ]}
              onPress={() => onSelectChat(support)}
            >
              <Card.Title
                title="Техподдержка"
                subtitle="Вопросы по приложению и доступу"
                titleStyle={{ color: theme.colors.onSecondaryContainer }}
                subtitleStyle={{ color: theme.colors.onSecondaryContainer, opacity: 0.85 }}
              />
            </Card>
          </>
        ) : null}

        {work.length > 0 ? (
          <>
            <SectionTitle label="Рабочие" />
            <Card mode="outlined" style={styles.listCard}>
              {work.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ChatListRow
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                  />
                </Fragment>
              ))}
            </Card>
          </>
        ) : null}

        {personal.length > 0 ? (
          <>
            <SectionTitle label="Личные" />
            <Card mode="outlined" style={styles.listCard}>
              {personal.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ChatListRow
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                  />
                </Fragment>
              ))}
            </Card>
          </>
        ) : null}

        {channels.length > 0 ? (
          <>
            <SectionTitle label="Каналы" />
            <Card mode="outlined" style={styles.listCard}>
              {channels.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ChatListRow
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                  />
                </Fragment>
              ))}
            </Card>
          </>
        ) : null}

        {archived.length > 0 ? (
          <>
            <SectionTitle label="Архив" />
            <Card mode="outlined" style={styles.listCard}>
              {archived.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ChatListRow
                    chat={c}
                    currentUserId={currentUserId}
                    selected={selectedChatId === c.id}
                    onPress={() => onSelectChat(c)}
                  />
                </Fragment>
              ))}
            </Card>
          </>
        ) : null}

        {!loading &&
        !displayed.ai &&
        work.length === 0 &&
        personal.length === 0 &&
        channels.length === 0 &&
        archived.length === 0 ? (
          <Text
            variant="bodyLarge"
            style={{ marginTop: 24, textAlign: "center", color: theme.colors.outline }}
          >
            Нет чатов по выбранному фильтру
          </Text>
        ) : null}

        {loading && chats.length === 0 ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ChatListRow({
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
  const theme = useTheme();
  const title = getChatDisplayName(chat, currentUserId);
  const preview = chat.lastMessage?.trim() || "Нет сообщений";
  const unread = (chat.unreadCount ?? 0) > 0;

  return (
    <List.Item
      title={title}
      titleNumberOfLines={1}
      description={preview}
      descriptionNumberOfLines={2}
      onPress={onPress}
      style={{
        backgroundColor: selected ? theme.colors.primaryContainer : undefined,
        paddingVertical: 4,
      }}
      right={() =>
        unread ? (
          <View style={styles.unreadWrap}>
            <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  search: { marginBottom: 10, borderRadius: 14 },
  tabsScroll: { maxHeight: 52, marginBottom: 4 },
  tabsRow: { flexDirection: "row", gap: 8, paddingVertical: 6, alignItems: "center" },
  chip: { marginRight: 4 },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  specialCard: { marginBottom: 10, borderRadius: 14 },
  listCard: { marginBottom: 12, borderRadius: 14 },
  loader: { paddingVertical: 40, alignItems: "center" },
  unreadWrap: { justifyContent: "center", paddingRight: 8 },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
