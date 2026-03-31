import * as Linking from "expo-linking";
import { useMemo, useState } from "react";
import { Image, Pressable, useWindowDimensions, View } from "react-native";
import RenderHTML from "react-native-render-html";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChannelPostJson } from "../lib/channelPost";
import { channelPostOpenUrl, resolveChannelMediaUrl } from "../lib/channelPost";
import { FluidText } from "./ui";
import { colors, fonts, radii, spacing } from "../theme/tokens";

type Props = {
  post: ChannelPostJson;
  isMine: boolean;
};

export function ChannelPostCard({ post, isMine }: Props) {
  const { width: screenW } = useWindowDimensions();
  const contentWidth = Math.max(200, screenW * 0.72);
  const [coverFailed, setCoverFailed] = useState(false);

  const coverUri = useMemo(() => resolveChannelMediaUrl(post.coverImage ?? null), [post.coverImage]);
  const html = typeof post.content === "string" ? post.content : "";
  const title = typeof post.title === "string" ? post.title : "Пост в канале";
  const openUrl = channelPostOpenUrl(post.postId);

  const textPrimary = isMine ? colors.white : colors.onSurface;
  const textSecondary = isMine ? "rgba(255,255,255,0.75)" : colors.onSurfaceVariant;
  const linkColor = isMine ? "rgba(195,192,255,0.95)" : colors.primary;
  const pollBg = isMine ? "rgba(255,255,255,0.12)" : colors.surfaceContainerHighest;

  const tagsStyles = useMemo(
    () => ({
      body: {
        color: isMine ? "rgba(255,255,255,0.92)" : colors.onSurface,
        fontFamily: fonts.body,
        fontSize: 15,
        lineHeight: 22,
      },
      p: { marginTop: 0, marginBottom: spacing.sm },
      div: { marginBottom: spacing.xs },
      ul: { marginBottom: spacing.sm },
      ol: { marginBottom: spacing.sm },
      li: { marginBottom: 4 },
      a: { color: linkColor, textDecorationLine: "underline" as const },
      strong: { fontFamily: fonts.bodySemibold },
      b: { fontFamily: fonts.bodySemibold },
    }),
    [isMine, linkColor],
  );

  const pollsFromPayload = Array.isArray(post.polls) ? post.polls : [];
  const showPollSection = post.hasPolls === true || pollsFromPayload.length > 0;

  return (
    <View style={{ gap: spacing.sm, minWidth: 0 }}>
      {post.forwarded && post.channelName ? (
        <FluidText variant="labelSm" color={textSecondary}>
          Переслано из канала · {post.channelName}
        </FluidText>
      ) : null}

      {coverUri && !coverFailed ? (
        <Pressable
          onPress={() => void Linking.openURL(openUrl)}
          style={{ borderRadius: radii.lg, overflow: "hidden" }}
        >
          <Image
            source={{ uri: coverUri }}
            style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.surfaceContainerHighest }}
            resizeMode="cover"
            onError={() => setCoverFailed(true)}
          />
        </Pressable>
      ) : null}

      <FluidText variant="titleSm" color={textPrimary} style={{ fontFamily: fonts.bodySemibold }}>
        {title}
      </FluidText>

      {html ? (
        <RenderHTML
          contentWidth={contentWidth}
          source={{ html }}
          tagsStyles={tagsStyles}
          defaultTextProps={{ selectable: true }}
          renderersProps={{
            a: {
              onPress: (_event, href) => {
                if (href) void Linking.openURL(href);
              },
            },
          }}
        />
      ) : (
        <FluidText variant="bodyMd" color={textSecondary}>
          Нет текста
        </FluidText>
      )}

      {showPollSection ? (
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radii.lg,
              backgroundColor: pollBg,
            }}
          >
            <MaterialCommunityIcons name="poll" size={18} color={isMine ? colors.white : colors.primary} />
            <View style={{ flex: 1 }}>
              <FluidText variant="labelMd" color={textPrimary}>
                Опрос
              </FluidText>
              <FluidText variant="labelSm" color={textSecondary}>
                Голосование в приложении скоро; сейчас можно открыть пост на сайте.
              </FluidText>
            </View>
          </View>
          <Pressable
            onPress={() => void Linking.openURL(openUrl)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.xs,
              paddingVertical: spacing.sm,
              borderRadius: radii.full,
              borderWidth: 1,
              borderColor: isMine ? "rgba(255,255,255,0.35)" : "rgba(145,143,161,0.35)",
            }}
          >
            <MaterialCommunityIcons name="open-in-new" size={16} color={linkColor} />
            <FluidText variant="labelMd" style={{ color: linkColor }}>
              Открыть пост
            </FluidText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
