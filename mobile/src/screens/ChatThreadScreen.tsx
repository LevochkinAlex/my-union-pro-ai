import { useRef, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChatMessageItem } from "../types/chat";
import { FluidText, FluidAvatar, GlassCard } from "../components/ui";
import { colors, fonts, radii, spacing } from "../theme/tokens";

type Props = {
  title: string;
  messages: ChatMessageItem[];
  loadingMessages: boolean;
  currentUserId: string | null;
  messageInput: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  onBack: () => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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

const AVATAR_COLORS = [
  "#4f46e5", "#7c3aed", "#0e7c6b", "#b85c2f",
  "#9c2a5e", "#3a7ca5", "#5c7a29", "#8b5cf6",
];

function pickColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function AttachmentView({ attachment, isMine }: { attachment: NonNullable<ChatMessageItem["attachments"]>[0], isMine: boolean }) {
  const isImage = attachment.type === "IMAGE" || attachment.type === "image" || attachment.mimeType?.startsWith("image/");
  if (isImage) {
    return (
      <View style={styles.imageAttachWrap}>
        <Image source={{ uri: attachment.url }} style={styles.imageAttach} />
      </View>
    );
  }

  return (
    <View style={[styles.fileAttachWrap, isMine && { borderColor: "rgba(255,255,255,0.2)" }]}>
      <View style={[styles.fileAttachIcon, isMine && { backgroundColor: "rgba(255,255,255,0.2)" }]}>
        <MaterialCommunityIcons name="file-document-outline" size={20} color={isMine ? colors.white : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <FluidText variant="labelMd" color={isMine ? colors.white : colors.onSurface} numberOfLines={1}>
          {attachment.name || "Файл"}
        </FluidText>
        <FluidText variant="labelSm" color={isMine ? "rgba(255,255,255,0.7)" : colors.onSurfaceVariant}>
          {attachment.size ? `${(attachment.size / 1024 / 1024).toFixed(1)} MB` : "Документ"}
        </FluidText>
      </View>
      <MaterialCommunityIcons name="download" size={20} color={isMine ? colors.white : colors.primary} />
    </View>
  );
}

function ReactionsView({ reactions }: { reactions: NonNullable<ChatMessageItem["reactions"]> }) {
  if (!reactions || reactions.length === 0) return null;
  const grouped = reactions.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <View style={styles.reactionsWrap}>
      {Object.entries(grouped).map(([emoji, count]) => (
        <View key={emoji} style={styles.reactionPill}>
          <Text style={{ fontSize: 12 }}>{emoji}</Text>
          <FluidText variant="labelSm" color={colors.onSurfaceVariant}>{count}</FluidText>
        </View>
      ))}
    </View>
  );
}

export function ChatThreadScreen({
  title,
  messages,
  loadingMessages,
  currentUserId,
  messageInput,
  onChangeInput,
  onSend,
  onBack,
}: Props) {
  const flatListRef = useRef<FlatList>(null);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerInfo}>
          <FluidText variant="titleMd" color={colors.primary} numberOfLines={1}>
            {title}
          </FluidText>
        </View>
        <Pressable style={styles.headerAction}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item, index }) => {
          const isMine = item.senderId === currentUserId;
          const prev = index > 0 ? messages[index - 1] : null;
          const showAvatar = !isMine && (!prev || prev.senderId !== item.senderId);
          const senderName = `${item.sender.firstName || ""} ${item.sender.lastName || ""}`.trim() || "Участник";

          const showDateSep =
            !prev || new Date(item.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();

          return (
            <>
              {showDateSep && (
                <View style={styles.dateSep}>
                  <View style={styles.dateSepPill}>
                    <FluidText variant="labelSm" color={colors.onSurfaceVariant}>
                      {formatDateSeparator(item.createdAt)}
                    </FluidText>
                  </View>
                </View>
              )}
              <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
                {!isMine && (
                  <View style={styles.avatarSlot}>
                    {showAvatar ? (
                      <FluidAvatar
                        uri={item.sender.avatarUrl}
                        name={senderName}
                        size={28}
                        rounded="full"
                      />
                    ) : (
                      <View style={styles.avatarSpacer} />
                    )}
                  </View>
                )}
                {isMine ? (
                  <LinearGradient
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.bubble, styles.bubbleMine]}
                  >
                    {item.replyTo && (
                      <View style={[styles.replyWrap, { borderLeftColor: "rgba(255,255,255,0.5)", backgroundColor: "rgba(255,255,255,0.1)" }]}>
                        <FluidText variant="labelSm" color={colors.white} style={{ fontFamily: fonts.bodySemibold }}>
                          {item.replyTo.sender?.firstName || "Пользователь"}
                        </FluidText>
                        <FluidText variant="bodySm" color="rgba(255,255,255,0.8)" numberOfLines={1}>
                          {item.replyTo.content}
                        </FluidText>
                      </View>
                    )}
                    <FluidText variant="bodyMd" color={colors.white}>
                      {item.content}
                    </FluidText>
                    {item.attachments?.map((att) => (
                      <AttachmentView key={att.id} attachment={att} isMine={isMine} />
                    ))}
                    <View style={styles.tsWrap}>
                      <FluidText variant="labelSm" color="rgba(255,255,255,0.6)">
                        {formatTime(item.createdAt)}
                      </FluidText>
                      {item.readBy && item.readBy.length > 0 && (
                        <MaterialCommunityIcons name="check-all" size={14} color="rgba(255,255,255,0.8)" style={{ marginLeft: 4 }} />
                      )}
                    </View>
                    <ReactionsView reactions={item.reactions || []} />
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.bubbleOther]}>
                    {showAvatar && (
                      <FluidText variant="labelSm" color={pickColor(item.senderId)} style={styles.senderName}>
                        {senderName}
                      </FluidText>
                    )}
                    {item.replyTo && (
                      <View style={[styles.replyWrap, { borderLeftColor: colors.primary, backgroundColor: colors.surfaceContainerLow }]}>
                        <FluidText variant="labelSm" color={colors.primary} style={{ fontFamily: fonts.bodySemibold }}>
                          {item.replyTo.sender?.firstName || "Пользователь"}
                        </FluidText>
                        <FluidText variant="bodySm" color={colors.onSurfaceVariant} numberOfLines={1}>
                          {item.replyTo.content}
                        </FluidText>
                      </View>
                    )}
                    <FluidText variant="bodyMd" color={colors.onSurface}>
                      {item.content}
                    </FluidText>
                    {item.attachments?.map((att) => (
                      <AttachmentView key={att.id} attachment={att} isMine={isMine} />
                    ))}
                    <FluidText variant="labelSm" color={colors.outline} style={styles.ts}>
                      {formatTime(item.createdAt)}
                    </FluidText>
                    <ReactionsView reactions={item.reactions || []} />
                  </View>
                )}
              </View>
            </>
          );
        }}
      />

      {/* Compose Bar */}
      <GlassCard style={styles.composeOuter} borderRadius={0}>
        <View style={styles.composeBar}>
          <Pressable style={styles.composePlusBtn}>
            <MaterialCommunityIcons name="plus-circle-outline" size={24} color={colors.onSurfaceVariant} />
          </Pressable>

          <View style={styles.composeCenter}>
            <TextInput
              style={styles.composeInput}
              value={messageInput}
              onChangeText={onChangeInput}
              placeholder="Сообщение…"
              placeholderTextColor={colors.outline}
              selectionColor={colors.primary}
              multiline
              maxLength={8000}
            />
            <View style={styles.composeToolsRow}>
              <View style={styles.composeToolsLeft}>
                <Pressable style={styles.toolBtn}><MaterialCommunityIcons name="format-bold" size={20} color={colors.onSurfaceVariant} /></Pressable>
                <Pressable style={styles.toolBtn}><MaterialCommunityIcons name="format-italic" size={20} color={colors.onSurfaceVariant} /></Pressable>
                <Pressable style={styles.toolBtn}><MaterialCommunityIcons name="code-tags" size={20} color={colors.onSurfaceVariant} /></Pressable>
                <Pressable style={styles.toolBtn}><MaterialCommunityIcons name="link-variant" size={20} color={colors.onSurfaceVariant} /></Pressable>
              </View>
              <Pressable style={styles.toolBtn}><MaterialCommunityIcons name="emoticon-outline" size={20} color={colors.onSurfaceVariant} /></Pressable>
            </View>
          </View>

          <Pressable
            onPress={onSend}
            disabled={!messageInput.trim()}
            style={({ pressed }) => [styles.sendBtnWrap, pressed && { opacity: 0.7 }]}
          >
            <LinearGradient
              colors={
                messageInput.trim()
                  ? [colors.gradientStart, colors.gradientEnd]
                  : [colors.surfaceContainerHigh, colors.surfaceContainerHigh]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtn}
            >
              <MaterialCommunityIcons
                name="send"
                size={20}
                color={messageInput.trim() ? colors.white : colors.outline}
              />
            </LinearGradient>
          </Pressable>
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: { flex: 1, marginLeft: spacing.md },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.md },
  dateSep: { alignItems: "center", marginVertical: spacing.xl },
  dateSepPill: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  msgRow: {
    flexDirection: "row",
    marginBottom: spacing.sm,
    maxWidth: "85%",
  },
  msgRowMine: { alignSelf: "flex-end" },
  msgRowOther: { alignSelf: "flex-start" },
  avatarSlot: { width: 32, marginRight: spacing.md, justifyContent: "flex-end" },
  avatarSpacer: { width: 28 },
  bubble: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexShrink: 1,
  },
  bubbleMine: {
    borderRadius: radii.xl,
    borderBottomRightRadius: radii.sm,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.xl,
    borderBottomLeftRadius: radii.sm,
  },
  senderName: {
    fontFamily: fonts.bodySemibold,
    marginBottom: 2,
  },
  ts: {
    alignSelf: "flex-end",
    marginTop: spacing.sm,
  },
  tsWrap: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: spacing.sm,
  },
  composeOuter: {
    borderTopWidth: 0,
    paddingBottom: spacing.lg,
  },
  composeBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  composePlusBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  composeCenter: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii["2xl"],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  composeInput: {
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 15,
    maxHeight: 120,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 24,
  },
  composeToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  composeToolsLeft: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  toolBtn: {
    padding: spacing.xs,
    borderRadius: radii.md,
  },
  sendBtnWrap: {
    marginBottom: spacing.xs,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  imageAttachWrap: {
    marginTop: spacing.sm,
    borderRadius: radii.xl,
    overflow: "hidden",
    width: "100%",
    aspectRatio: 4 / 3,
  },
  imageAttach: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  fileAttachWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "rgba(145, 143, 161, 0.2)",
    gap: spacing.md,
  },
  fileAttachIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: "rgba(195, 192, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.sm,
  },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  replyWrap: {
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    marginBottom: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  }
});
