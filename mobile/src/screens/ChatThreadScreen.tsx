import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChatMessageItem } from "../types/chat";
import { ChannelPostCard } from "../components/ChannelPostCard";
import { formatReplySnippet, getChannelPostFromMessage } from "../lib/channelPost";
import { FluidText, FluidAvatar } from "../components/ui";
import { colors, fonts } from "../theme/tokens";

/* ─── Types ─── */
type Props = {
  title: string;
  messages: ChatMessageItem[];
  loadingMessages: boolean;
  currentUserId: string | null;
  messageInput: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  onPickImage: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ChatMessageItem) => void;
  replyToMessage: ChatMessageItem | null;
  onCancelReply: () => void;
  onBack: () => void;
};

type Attachment = NonNullable<ChatMessageItem["attachments"]>[number];

/* ─── Constants ─── */
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🙏", "😮"] as const;
const AVATAR_COLORS = ["#4f46e5", "#7c3aed", "#0e7c6b", "#b85c2f", "#9c2a5e", "#3a7ca5", "#5c7a29", "#8b5cf6"];

/* ─── Helpers ─── */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pickColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatSenderName(sender: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return `${sender?.firstName || ""} ${sender?.lastName || ""}`.trim() || "Участник";
}

/* ─── Swipe-to-reply row ─── */
function SwipeRow({ children, onSwipe }: { children: React.ReactNode; onSwipe: () => void }) {
  const tx = useRef(new Animated.Value(0)).current;
  const firedRef = useRef(false);
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  const snap = () => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, tension: 140, friction: 12 }).start();
    firedRef.current = false;
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 10 && Math.abs(g.dy) < 12,
        onPanResponderMove: (_, g) => {
          const dx = Math.max(0, Math.min(80, g.dx));
          tx.setValue(dx);
          if (dx >= 60 && !firedRef.current) {
            firedRef.current = true;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onSwipeRef.current();
          }
        },
        onPanResponderRelease: snap,
        onPanResponderTerminate: snap,
      }),
    [tx],
  );

  const iconOp = tx.interpolate({ inputRange: [0, 20, 50], outputRange: [0, 0.3, 1], extrapolate: "clamp" });

  return (
    <View>
      <Animated.View style={{ position: "absolute", left: -28, bottom: 4, opacity: iconOp }} pointerEvents="none">
        <MaterialCommunityIcons name="reply" size={18} color={colors.primary} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

/* ─── Attachment ─── */
function AttachmentView({ att, isMine, maxW }: { att: Attachment; isMine: boolean; maxW: number }) {
  const isImg = att.type === "IMAGE" || att.type === "image" || att.mimeType?.startsWith("image/");
  if (isImg) {
    return (
      <View style={{ marginTop: 6, borderRadius: 12, overflow: "hidden" }}>
        <Image source={{ uri: att.url }} style={{ width: maxW, height: undefined, aspectRatio: 4 / 3 }} resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={[st.fileRow, isMine && { borderColor: "rgba(255,255,255,0.15)" }]}>
      <View style={[st.fileIcon, isMine && { backgroundColor: "rgba(255,255,255,0.15)" }]}>
        <MaterialCommunityIcons name="file-document-outline" size={18} color={isMine ? colors.white : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <FluidText variant="labelMd" color={isMine ? colors.white : colors.onSurface} numberOfLines={1}>{att.name || "Файл"}</FluidText>
        <FluidText variant="labelSm" color={isMine ? "rgba(255,255,255,0.65)" : colors.onSurfaceVariant}>
          {att.size ? `${(att.size / 1024 / 1024).toFixed(1)} MB` : "Документ"}
        </FluidText>
      </View>
      <MaterialCommunityIcons name="download" size={18} color={isMine ? colors.white : colors.primary} />
    </View>
  );
}

/* ─── Reactions row ─── */
function Reactions({ reactions, onToggle, messageId }: { reactions: NonNullable<ChatMessageItem["reactions"]>; onToggle: (id: string, e: string) => void; messageId: string }) {
  const entries = useMemo(() => {
    if (!Array.isArray(reactions) || reactions.length === 0) return [];
    const g: Record<string, number> = {};
    for (const r of reactions) {
      if (!r || typeof r.emoji !== "string" || !r.emoji) continue;
      g[r.emoji] = (g[r.emoji] || 0) + 1;
    }
    return Object.entries(g);
  }, [reactions]);

  if (entries.length === 0) return null;
  return (
    <View style={st.rxRow}>
      {entries.map(([emoji, cnt]) => (
        <Pressable key={emoji} style={st.rxPill} onPress={() => onToggle(messageId, emoji)}>
          <Text style={{ fontSize: 13 }}>{emoji}</Text>
          <FluidText variant="labelSm" color={colors.onSurfaceVariant}>{cnt}</FluidText>
        </Pressable>
      ))}
      <Pressable style={[st.rxPill, st.rxAdd]} onPress={() => onToggle(messageId, "👍")}>
        <MaterialCommunityIcons name="plus" size={12} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

/* ─── Reaction tray (on long-press) ─── */
function ReactionTray({ isMine, onPick, onReply }: { isMine: boolean; onPick: (e: string) => void; onReply: () => void }) {
  return (
    <View style={[st.tray, isMine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
      {QUICK_REACTIONS.map((e) => (
        <Pressable key={e} style={st.trayBtn} onPress={() => { void Haptics.selectionAsync(); onPick(e); }}>
          <Text style={{ fontSize: 19 }}>{e}</Text>
        </Pressable>
      ))}
      <View style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: 2 }} />
      <Pressable style={st.trayReplyBtn} onPress={onReply}>
        <MaterialCommunityIcons name="reply" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/* ─── Reply inline (inside bubble) ─── */
function ReplyInline({ replyTo, isMine }: { replyTo: NonNullable<ChatMessageItem["replyTo"]>; isMine: boolean }) {
  return (
    <View style={[st.replyInline, isMine ? { borderLeftColor: "rgba(255,255,255,0.45)", backgroundColor: "rgba(255,255,255,0.08)" } : { borderLeftColor: colors.primary, backgroundColor: colors.surfaceContainerLow }]}>
      <FluidText variant="labelSm" color={isMine ? colors.white : colors.primary} style={{ fontFamily: fonts.bodySemibold }}>
        {replyTo.sender?.firstName || "Пользователь"}
      </FluidText>
      <FluidText variant="bodySm" color={isMine ? "rgba(255,255,255,0.75)" : colors.onSurfaceVariant} numberOfLines={2}>
        {formatReplySnippet(replyTo.content)}
      </FluidText>
    </View>
  );
}

/* ════════════════════════════════════════════════
   MAIN SCREEN
   ════════════════════════════════════════════════ */
export function ChatThreadScreen({
  title, messages, currentUserId,
  messageInput, onChangeInput, onSend, onPickImage,
  onToggleReaction, onReply, replyToMessage, onCancelReply, onBack,
}: Props) {
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const isAtBottomRef = useRef(true);
  const [trayMsgId, setTrayMsgId] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const { width: screenW } = useWindowDimensions();
  const bubbleMax = Math.round(screenW * 0.78);
  const imgMax = bubbleMax - 28;

  const handleLongPress = useCallback((id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTrayMsgId((p) => (p === id ? null : id));
  }, []);

  const handleReply = useCallback((item: ChatMessageItem) => {
    setTrayMsgId(null);
    onReply(item);
    inputRef.current?.focus();
  }, [onReply]);

  const handleSend = () => {
    if (!messageInput.trim()) return;
    onSend();
    setPlusOpen(false);
  };

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    isAtBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
  }, []);

  const renderItem = useCallback(({ item, index }: { item: ChatMessageItem; index: number }) => {
    const mine = item.senderId === currentUserId;
    const prev = index > 0 ? messages[index - 1] : null;
    const sameSender = prev?.senderId === item.senderId;
    const showAvatar = !mine && !sameSender;
    const senderName = formatSenderName(item.sender);
    const showDate = !prev || new Date(item.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
    const chPost = getChannelPostFromMessage(item.content, item.messageType);

    return (
      <View style={st.msgFull}>
        {showDate && (
          <View style={st.dateSep}>
            <View style={st.datePill}>
              <FluidText variant="labelSm" color={colors.onSurfaceVariant}>{formatDateSeparator(item.createdAt)}</FluidText>
            </View>
          </View>
        )}

        <SwipeRow onSwipe={() => handleReply(item)}>
          <Pressable onLongPress={() => handleLongPress(item.id)} delayLongPress={250} onPress={() => trayMsgId && setTrayMsgId(null)}>

            {trayMsgId === item.id && (
              <View style={mine ? { alignItems: "flex-end" } : { alignItems: "flex-start", paddingLeft: 40 }}>
                <ReactionTray
                  isMine={mine}
                  onPick={(e) => { onToggleReaction(item.id, e); setTrayMsgId(null); }}
                  onReply={() => handleReply(item)}
                />
              </View>
            )}

            <View style={[st.bubbleRow, mine ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }]}>
              {!mine && (
                <View style={st.avatarCol}>
                  {showAvatar ? (
                    <FluidAvatar uri={item.sender.avatarUrl} name={senderName} size={28} rounded="full" />
                  ) : (
                    <View style={{ width: 28 }} />
                  )}
                </View>
              )}

              <View style={{ maxWidth: bubbleMax }}>
                {mine ? (
                  <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.bubbleMine}>
                    {item.replyTo && <ReplyInline replyTo={item.replyTo} isMine />}
                    {chPost ? <ChannelPostCard post={chPost} isMine /> : <FluidText variant="bodyMd" color={colors.white}>{item.content}</FluidText>}
                    {item.attachments?.map((a: Attachment) => <AttachmentView key={a.id} att={a} isMine maxW={imgMax} />)}
                  </LinearGradient>
                ) : (
                  <View style={st.bubbleOther}>
                    {showAvatar && <FluidText variant="labelSm" color={pickColor(item.senderId)} style={{ fontFamily: fonts.bodySemibold, marginBottom: 2 }}>{senderName}</FluidText>}
                    {item.replyTo && <ReplyInline replyTo={item.replyTo} isMine={false} />}
                    {chPost ? <ChannelPostCard post={chPost} isMine={false} /> : <FluidText variant="bodyMd" color={colors.onSurface}>{item.content}</FluidText>}
                    {item.attachments?.map((a: Attachment) => <AttachmentView key={a.id} att={a} isMine={false} maxW={imgMax} />)}
                  </View>
                )}
              </View>
            </View>

            <View style={[st.tsRow, mine ? { justifyContent: "flex-end", paddingRight: 4 } : { justifyContent: "flex-start", paddingLeft: 40 }]}>
              <FluidText variant="labelSm" color={colors.outline}>{formatTime(item.createdAt)}</FluidText>
              {mine && item.readBy && item.readBy.length > 0 && (
                <MaterialCommunityIcons name="check-all" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
              )}
            </View>

            <View style={mine ? { alignItems: "flex-end" } : { paddingLeft: 40 }}>
              <Reactions reactions={item.reactions || []} onToggle={onToggleReaction} messageId={item.id} />
            </View>
          </Pressable>
        </SwipeRow>
      </View>
    );
  }, [messages, trayMsgId, currentUserId, bubbleMax, imgMax, handleLongPress, handleReply, onToggleReaction]);

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>

      {/* ── HEADER ── */}
      <View style={st.header}>
        <Pressable onPress={onBack} hitSlop={8} style={st.headerBack}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={st.headerAvatar}>
          <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <FluidText variant="titleSm" color={colors.onSurface} numberOfLines={1} style={{ fontFamily: fonts.bodySemibold }}>
            {title}
          </FluidText>
        </View>
        <Pressable hitSlop={8} style={st.headerIcon}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable hitSlop={8} style={[st.headerIcon, { marginLeft: 4 }]}>
          <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* ── MESSAGES ── */}
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8 }}
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onScrollBeginDrag={() => { setTrayMsgId(null); setPlusOpen(false); }}
        onContentSizeChange={() => { if (isAtBottomRef.current) flatListRef.current?.scrollToEnd({ animated: false }); }}
        renderItem={renderItem}
      />

      {/* ── COMPOSER ── */}
      <View style={st.composeWrap}>
        {replyToMessage && (
          <View style={st.replyBar}>
            <View style={st.replyAccent} />
            <View style={{ flex: 1 }}>
              <FluidText variant="labelSm" color={colors.primary} style={{ fontFamily: fonts.bodySemibold }}>
                {formatSenderName(replyToMessage.sender)}
              </FluidText>
              <FluidText variant="bodySm" color={colors.onSurfaceVariant} numberOfLines={1}>
                {formatReplySnippet(replyToMessage.content)}
              </FluidText>
            </View>
            <Pressable onPress={onCancelReply} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
            </Pressable>
          </View>
        )}

        <View style={st.composeRow}>
          <Pressable onPress={() => setPlusOpen((p) => !p)} hitSlop={6} style={st.composeBtn}>
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.composeBtnGrad}>
              <MaterialCommunityIcons name={plusOpen ? "close" : "plus"} size={18} color={colors.white} />
            </LinearGradient>
          </Pressable>

          <View style={st.inputPill}>
            <TextInput
              ref={inputRef}
              style={st.inputField}
              value={messageInput}
              onChangeText={onChangeInput}
              placeholder="Сообщение…"
              placeholderTextColor={colors.outline}
              selectionColor={colors.primary}
              multiline
              maxLength={8000}
            />
          </View>

          <Pressable hitSlop={6} style={st.composeBtn}>
            <MaterialCommunityIcons name="microphone-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>

          <Pressable onPress={handleSend} disabled={!messageInput.trim()} hitSlop={6} style={({ pressed }) => [st.composeBtn, pressed && { opacity: 0.7 }]}>
            <LinearGradient
              colors={messageInput.trim() ? [colors.gradientStart, colors.gradientEnd] : [colors.surfaceContainerHigh, colors.surfaceContainerHigh]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={st.sendCircle}
            >
              <MaterialCommunityIcons name="send" size={17} color={messageInput.trim() ? colors.white : colors.outline} style={{ marginLeft: 2 }} />
            </LinearGradient>
          </Pressable>
        </View>

        {plusOpen && (
          <View style={st.attachRow}>
            <Pressable style={st.attachChip} onPress={() => { setPlusOpen(false); onPickImage(); }}>
              <MaterialCommunityIcons name="image-outline" size={18} color={colors.primary} />
              <FluidText variant="labelSm" color={colors.onSurface}>Фото</FluidText>
            </Pressable>
            <Pressable style={st.attachChip} onPress={() => setPlusOpen(false)}>
              <MaterialCommunityIcons name="file-outline" size={18} color={colors.primary} />
              <FluidText variant="labelSm" color={colors.onSurface}>Файл</FluidText>
            </Pressable>
            <Pressable style={st.attachChip} onPress={() => setPlusOpen(false)}>
              <MaterialCommunityIcons name="camera-outline" size={18} color={colors.primary} />
              <FluidText variant="labelSm" color={colors.onSurface}>Камера</FluidText>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ═══════════════ STYLES ═══════════════ */
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerBack: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceContainerHighest, alignItems: "center", justifyContent: "center" },
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

  dateSep: { alignItems: "center", marginVertical: 14 },
  datePill: { backgroundColor: colors.surfaceContainerHigh, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 4 },

  msgFull: { marginBottom: 2, width: "100%" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end" },
  avatarCol: { width: 32, marginRight: 8, alignItems: "center", justifyContent: "flex-end" },

  bubbleMine: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    overflow: "hidden",
  },
  bubbleOther: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    overflow: "hidden",
  },

  replyInline: { paddingLeft: 10, borderLeftWidth: 2, marginBottom: 6, paddingVertical: 3, borderRadius: 4 },

  tsRow: { flexDirection: "row", alignItems: "center", marginTop: 3, marginBottom: 1 },

  rxRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2, marginBottom: 2 },
  rxPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.surfaceContainerHighest, borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  rxAdd: { borderColor: "rgba(145,143,161,0.3)" },

  tray: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 100,
    paddingHorizontal: 6, paddingVertical: 4,
    gap: 1,
    marginBottom: 4,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    ...(Platform.OS === "ios" ? { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } : { elevation: 8 }),
  },
  trayBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  trayReplyBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceContainerHighest },

  fileRow: { flexDirection: "row", alignItems: "center", marginTop: 6, padding: 8, backgroundColor: colors.surfaceContainerLowest, borderRadius: 12, borderWidth: 1, borderColor: "rgba(145,143,161,0.2)", gap: 8 },
  fileIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(195,192,255,0.2)", alignItems: "center", justifyContent: "center" },

  composeWrap: {
    backgroundColor: colors.surfaceContainerLow,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingBottom: Platform.OS === "ios" ? 4 : 6,
  },
  replyBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  replyAccent: { width: 3, borderRadius: 2, alignSelf: "stretch", backgroundColor: colors.primary },
  composeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 2,
    gap: 4,
  },
  composeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  composeBtnGrad: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  inputPill: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    minHeight: 40,
    justifyContent: "center",
  },
  inputField: {
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 100,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  attachRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4,
  },
  attachChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: colors.surfaceContainerHigh,
  },
});
