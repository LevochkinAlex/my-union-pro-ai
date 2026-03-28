import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FluidText, FluidAvatar, FluidButton, GlassCard } from "../components/ui";
import { colors, fonts, radii, spacing } from "../theme/tokens";

type UserInfo = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

type Props = {
  user: UserInfo | null;
  onNavigateToSettings: () => void;
};

const ACTIVITY_ITEMS = [
  { color: colors.tertiary, label: "Вошёл в систему", time: "Сегодня, 10:30" },
  { color: colors.primary, label: "Отправил сообщение", time: "Вчера, 18:45" },
  { color: colors.secondary, label: "Обновил профиль", time: "3 дня назад" },
];

export function ProfileScreen({ user, onNavigateToSettings }: Props) {
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Пользователь";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Profile header */}
      <View style={styles.headerSection}>
        <View style={styles.avatarWrap}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarRing}
          >
            <FluidAvatar
              uri={user?.avatarUrl}
              name={displayName}
              size={88}
              rounded="xl"
              style={{ borderWidth: 3, borderColor: colors.surface }}
            />
          </LinearGradient>
        </View>
        <FluidText variant="headlineLg" color={colors.onSurface} style={styles.nameText}>
          {displayName}
        </FluidText>
        {user?.email && (
          <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: 4 }}>
            {user.email}
          </FluidText>
        )}

        {/* Chips */}
        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <FluidText variant="labelSm" color={colors.primary}>Участник</FluidText>
          </View>
          <View style={styles.chip}>
            <FluidText variant="labelSm" color={colors.tertiary}>Онлайн</FluidText>
          </View>
        </View>

        <FluidButton
          title="Настройки"
          variant="surface"
          onPress={onNavigateToSettings}
          icon={<MaterialCommunityIcons name="cog-outline" size={18} color={colors.onSurface} />}
          style={{ marginTop: spacing["2xl"] }}
        />
      </View>

      {/* Bento grid */}
      <View style={styles.bentoGrid}>
        {/* About */}
        <GlassCard style={styles.bentoBig} borderRadius={radii["2xl"]}>
          <View style={styles.bentoInner}>
            <FluidText variant="titleSm" color={colors.onSurfaceVariant}>О себе</FluidText>
            <FluidText variant="bodyMd" color={colors.onSurface} style={{ marginTop: spacing.md }}>
              Участник профсоюза. Использует платформу для общения и решения рабочих вопросов.
            </FluidText>
          </View>
        </GlassCard>

        {/* Activity */}
        <GlassCard style={styles.bentoSmall} borderRadius={radii["2xl"]}>
          <View style={styles.bentoInner}>
            <FluidText variant="titleSm" color={colors.onSurfaceVariant}>Активность</FluidText>
            {ACTIVITY_ITEMS.map((item, idx) => (
              <View key={idx} style={styles.activityItem}>
                <View style={[styles.activityDot, { backgroundColor: item.color }]} />
                <View style={{ flex: 1 }}>
                  <FluidText variant="bodySm" color={colors.onSurface}>{item.label}</FluidText>
                  <FluidText variant="labelSm" color={colors.outline}>{item.time}</FluidText>
                </View>
              </View>
            ))}
          </View>
        </GlassCard>

        {/* Shared Media placeholder */}
        <GlassCard style={styles.bentoFull} borderRadius={radii["2xl"]}>
          <View style={styles.bentoInner}>
            <FluidText variant="titleSm" color={colors.onSurfaceVariant}>Общие файлы</FluidText>
            <View style={styles.mediaGrid}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.mediaPlaceholder}>
                  <MaterialCommunityIcons name="image-outline" size={24} color={colors.outline} />
                </View>
              ))}
            </View>
          </View>
        </GlassCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: spacing["6xl"] },
  headerSection: {
    alignItems: "center",
    paddingTop: spacing["4xl"],
    paddingHorizontal: spacing["3xl"],
  },
  avatarWrap: { marginBottom: spacing.xl },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: radii["3xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  nameText: {
    fontFamily: fonts.headlineExtrabold,
    textAlign: "center",
  },
  chipsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  chip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
  },
  bentoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginTop: spacing["3xl"],
  },
  bentoBig: {
    flex: 1,
    minWidth: "55%",
  },
  bentoSmall: {
    flex: 1,
    minWidth: "35%",
  },
  bentoFull: {
    width: "100%",
  },
  bentoInner: {
    padding: spacing.xl,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mediaGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  mediaPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
});
