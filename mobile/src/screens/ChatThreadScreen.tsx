import { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
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
                    <FluidText variant="bodyMd" color={colors.white}>
                      {item.content}
                    </FluidText>
                    <FluidText variant="labelSm" color="rgba(255,255,255,0.6)" style={styles.ts}>
                      {formatTime(item.createdAt)}
                    </FluidText>
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.bubbleOther]}>
                    {showAvatar && (
                      <FluidText variant="labelSm" color={pickColor(item.senderId)} style={styles.senderName}>
                        {senderName}
                      </FluidText>
                    )}
                    <FluidText variant="bodyMd" color={colors.onSurface}>
                      {item.content}
                    </FluidText>
                    <FluidText variant="labelSm" color={colors.outline} style={styles.ts}>
                      {formatTime(item.createdAt)}
                    </FluidText>
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
          <Pressable style={styles.composeIcon}>
            <MaterialCommunityIcons name="plus" size={22} color={colors.tertiary} />
          </Pressable>
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
          <Pressable
            onPress={onSend}
            disabled={!messageInput.trim()}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
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
                size={18}
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
    maxWidth: "100%",
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
  composeOuter: {
    borderTopWidth: 0,
  },
  composeBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  composeIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  composeInput: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii["2xl"],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
