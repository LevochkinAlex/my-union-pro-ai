import { useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChatMessageItem } from "../types/chat";
import { FluidText, GlassCard } from "../components/ui";
import { colors, fonts, radii, spacing } from "../theme/tokens";

type Props = {
  messages: ChatMessageItem[];
  loadingMessages: boolean;
  currentUserId: string | null;
  messageInput: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  onPickImage: () => void;
  onBack: () => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const QUICK_ACTIONS = [
  { icon: "text-box-outline" as const, label: "Резюме", desc: "Краткий итог" },
  { icon: "pencil-outline" as const, label: "Улучшить", desc: "Переписать текст" },
  { icon: "translate" as const, label: "Перевести", desc: "На другой язык" },
  { icon: "lightbulb-outline" as const, label: "Идеи", desc: "Генерация идей" },
];

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

export function AIBotChatScreen({
  messages,
  loadingMessages,
  currentUserId,
  messageInput,
  onChangeInput,
  onSend,
  onPickImage,
  onBack,
}: Props) {
  const flatListRef = useRef<FlatList>(null);
  const hasMessages = messages.length > 0;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <LinearGradient
          colors={[colors.gradientStart, "#7c3aed"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.aiAvatar}
        >
          <FluidText variant="titleSm" color={colors.white}>✦</FluidText>
        </LinearGradient>
        <View style={styles.headerInfo}>
          <FluidText variant="titleMd" color={colors.onSurface}>AI Ассистент</FluidText>
          <FluidText variant="labelSm" color={colors.tertiary}>онлайн</FluidText>
        </View>
      </View>

      {!hasMessages ? (
        <View style={styles.emptyState}>
          <LinearGradient
            colors={[colors.gradientStart, "#7c3aed"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyIcon}
          >
            <FluidText variant="displayLg" color={colors.white}>✦</FluidText>
          </LinearGradient>
          <FluidText variant="headlineSm" color={colors.onSurface} style={{ marginTop: spacing["3xl"], textAlign: "center" }}>
            Чем могу помочь?
          </FluidText>
          <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: spacing.md, textAlign: "center" }}>
            Задайте вопрос или выберите действие
          </FluidText>

          {/* Quick actions bento */}
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => onChangeInput(action.label + ": ")}
                style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.8 }]}
              >
                <View style={styles.quickIconWrap}>
                  <MaterialCommunityIcons name={action.icon} size={20} color={colors.primary} />
                </View>
                <FluidText variant="titleSm" color={colors.onSurface}>{action.label}</FluidText>
                <FluidText variant="labelSm" color={colors.onSurfaceVariant}>{action.desc}</FluidText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          data={messages}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMine = item.senderId === currentUserId;
            return (
              <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
                {isMine ? (
                  <LinearGradient
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.bubble, styles.bubbleMine]}
                  >
                    <FluidText variant="bodyMd" color={colors.white}>{item.content}</FluidText>
                    {item.attachments?.map((att: NonNullable<ChatMessageItem["attachments"]>[number]) => (
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
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.bubbleAI]}>
                    <FluidText variant="bodyMd" color={colors.onSurface}>{item.content}</FluidText>
                    {item.attachments?.map((att: NonNullable<ChatMessageItem["attachments"]>[number]) => (
                      <AttachmentView key={att.id} attachment={att} isMine={isMine} />
                    ))}
                    <FluidText variant="labelSm" color={colors.outline} style={styles.ts}>
                      {formatTime(item.createdAt)}
                    </FluidText>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Compose */}
      <GlassCard style={styles.composeOuter} borderRadius={0}>
        <View style={styles.composeBar}>
          <Pressable style={styles.composePlusBtn} onPress={onPickImage}>
            <MaterialCommunityIcons name="plus-circle-outline" size={24} color={colors.onSurfaceVariant} />
          </Pressable>

          <View style={styles.composeInputWrap}>
            <TextInput
              style={styles.composeInput}
              value={messageInput}
              onChangeText={onChangeInput}
              placeholder="Спросите AI…"
              placeholderTextColor={colors.outline}
              selectionColor={colors.primary}
              multiline
              maxLength={8000}
            />
            <Pressable style={styles.composeEmojiBtn}>
              <MaterialCommunityIcons name="emoticon-outline" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
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
    </KeyboardAvoidingView>
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
    gap: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["3xl"],
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii["4xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginTop: spacing["4xl"],
    justifyContent: "center",
  },
  quickCard: {
    width: "45%",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii["2xl"],
    padding: spacing.xl,
    gap: spacing.sm,
  },
  quickIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  msgRow: {
    flexDirection: "row",
    marginBottom: spacing.md,
    maxWidth: "85%",
  },
  msgRowMine: { alignSelf: "flex-end" },
  msgRowOther: { alignSelf: "flex-start" },
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
  bubbleAI: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.xl,
    borderBottomLeftRadius: radii.sm,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(76,215,246,0.3)",
  },
  ts: {
    alignSelf: "flex-end",
    marginTop: spacing.sm,
  },
  tsWrap: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginTop: spacing.sm },
  composeOuter: {
    borderTopWidth: 0,
    paddingBottom: spacing.xs,
  },
  composeBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.sm,
  },
  composePlusBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  composeInputWrap: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    minHeight: 44,
  },
  composeInput: {
    flex: 1,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 15,
    maxHeight: 110,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: 22,
  },
  composeEmojiBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  sendBtnWrap: {
    alignSelf: "flex-end",
  },
  sendBtn: {
    width: 40,
    height: 40,
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
});
