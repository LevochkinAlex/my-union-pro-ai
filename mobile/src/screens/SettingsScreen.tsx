import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
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
  onLogout: () => void;
  onBack: () => void;
};

type SettingsRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
};

function SettingsRow({ icon, label, subtitle, onPress, rightElement, danger }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.8 }]}
    >
      <View style={[styles.rowIconWrap, danger && { backgroundColor: colors.errorContainer }]}>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={danger ? colors.error : colors.onSurfaceVariant}
        />
      </View>
      <View style={styles.rowContent}>
        <FluidText variant="bodyMd" color={danger ? colors.error : colors.onSurface}>{label}</FluidText>
        {subtitle && <FluidText variant="labelSm" color={colors.outline}>{subtitle}</FluidText>}
      </View>
      {rightElement ?? (
        onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.outline} /> : null
      )}
    </Pressable>
  );
}

export function SettingsScreen({ user, onLogout, onBack }: Props) {
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Пользователь";

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <FluidText variant="titleLg" color={colors.onSurface}>Настройки</FluidText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Profile card */}
        <GlassCard style={styles.profileCard} borderRadius={radii["2xl"]}>
          <View style={styles.profileInner}>
            <View style={styles.profileRow}>
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.profileRing}
              >
                <FluidAvatar
                  uri={user?.avatarUrl}
                  name={displayName}
                  size={52}
                  rounded="full"
                  style={{ borderWidth: 2, borderColor: colors.surface }}
                />
              </LinearGradient>
              <View style={styles.profileInfo}>
                <FluidText variant="titleMd" color={colors.onSurface}>{displayName}</FluidText>
                {user?.email && (
                  <FluidText variant="bodySm" color={colors.onSurfaceVariant}>{user.email}</FluidText>
                )}
              </View>
              <Pressable style={styles.editBtn}>
                <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </GlassCard>

        {/* Account */}
        <FluidText variant="labelMd" color={colors.onSurfaceVariant} style={styles.sectionTitle}>
          АККАУНТ
        </FluidText>
        <View style={styles.section}>
          <SettingsRow icon="account-outline" label="Личные данные" onPress={() => {}} />
          <SettingsRow icon="shield-lock-outline" label="Безопасность" onPress={() => {}} />
          <SettingsRow icon="link-variant" label="Привязки" subtitle="Telegram, Email" onPress={() => {}} />
        </View>

        {/* Preferences */}
        <FluidText variant="labelMd" color={colors.onSurfaceVariant} style={styles.sectionTitle}>
          ПРЕДПОЧТЕНИЯ
        </FluidText>
        <View style={styles.section}>
          <SettingsRow
            icon="bell-outline"
            label="Уведомления"
            rightElement={<Switch value={true} trackColor={{ true: colors.primaryContainer, false: colors.surfaceContainerHighest }} thumbColor={colors.primary} />}
          />
          <SettingsRow icon="translate" label="Язык" subtitle="Русский" onPress={() => {}} />
        </View>

        {/* Appearance */}
        <FluidText variant="labelMd" color={colors.onSurfaceVariant} style={styles.sectionTitle}>
          ВНЕШНИЙ ВИД
        </FluidText>
        <View style={styles.section}>
          <SettingsRow
            icon="theme-light-dark"
            label="Тёмная тема"
            rightElement={<Switch value={true} trackColor={{ true: colors.primaryContainer, false: colors.surfaceContainerHighest }} thumbColor={colors.primary} />}
          />
          <SettingsRow icon="format-size" label="Размер текста" subtitle="Стандартный" onPress={() => {}} />
        </View>

        {/* Danger */}
        <FluidText variant="labelMd" color={colors.error} style={styles.sectionTitle}>
          ОПАСНАЯ ЗОНА
        </FluidText>
        <View style={[styles.section, styles.dangerSection]}>
          <SettingsRow icon="logout" label="Выйти" danger onPress={onLogout} />
          <SettingsRow icon="delete-outline" label="Удалить аккаунт" danger onPress={() => {}} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  scrollView: { flex: 1 },
  content: { paddingBottom: spacing["6xl"] },
  profileCard: { marginHorizontal: spacing.xl, marginTop: spacing.xl },
  profileInner: { padding: spacing.xl },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  profileRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: { flex: 1 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: fonts.bodySemibold,
    letterSpacing: 0.8,
    marginTop: spacing["3xl"],
    marginBottom: spacing.lg,
    marginLeft: spacing["3xl"],
  },
  section: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii["2xl"],
    overflow: "hidden",
  },
  dangerSection: {
    backgroundColor: "rgba(147,0,10,0.08)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1 },
});
