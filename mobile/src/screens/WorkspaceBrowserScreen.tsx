import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FluidText, GlassCard } from "../components/ui";
import { colors, fonts, radii, spacing } from "../theme/tokens";

type Props = {
  onBack?: () => void;
};

const WORKSPACES = [
  { id: "1", name: "МПО", active: true },
  { id: "2", name: "РПО", active: false },
  { id: "3", name: "ППО", active: false },
];

export function WorkspaceBrowserScreen({ onBack }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.layout}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          {WORKSPACES.map((ws) => (
            <Pressable key={ws.id} style={styles.sidebarItem}>
              <View style={[styles.wsIcon, ws.active && styles.wsIconActive]}>
                <FluidText variant="titleSm" color={ws.active ? colors.white : colors.onSurfaceVariant}>
                  {ws.name[0]}
                </FluidText>
              </View>
              {ws.active && <View style={styles.activeBar} />}
            </Pressable>
          ))}
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <FluidText variant="headlineSm" color={colors.onSurface}>Пространства</FluidText>
          <FluidText variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: 4 }}>
            Управление вашими организациями
          </FluidText>

          {/* Bento grid */}
          <View style={styles.bentoGrid}>
            {/* Channels card */}
            <GlassCard style={styles.bentoCard} borderRadius={radii["2xl"]}>
              <View style={styles.bentoInner}>
                <View style={styles.bentoHeader}>
                  <MaterialCommunityIcons name="pound" size={20} color={colors.primary} />
                  <FluidText variant="titleSm" color={colors.onSurface}>Каналы</FluidText>
                </View>
                <View style={styles.channelList}>
                  {["Общий", "Новости", "Объявления"].map((ch) => (
                    <View key={ch} style={styles.channelItem}>
                      <FluidText variant="bodySm" color={colors.onSurfaceVariant}># {ch}</FluidText>
                    </View>
                  ))}
                </View>
              </View>
            </GlassCard>

            {/* Integrations card */}
            <GlassCard style={styles.bentoCard} borderRadius={radii["2xl"]}>
              <View style={styles.bentoInner}>
                <View style={styles.bentoHeader}>
                  <MaterialCommunityIcons name="puzzle-outline" size={20} color={colors.tertiary} />
                  <FluidText variant="titleSm" color={colors.onSurface}>Интеграции</FluidText>
                </View>
                <View style={styles.integrationChips}>
                  {["Telegram", "Email", "Госуслуги"].map((name) => (
                    <View key={name} style={styles.integrationChip}>
                      <FluidText variant="labelSm" color={colors.onSurfaceVariant}>{name}</FluidText>
                    </View>
                  ))}
                </View>
              </View>
            </GlassCard>

            {/* Members activity */}
            <GlassCard style={styles.bentoCardFull} borderRadius={radii["2xl"]}>
              <View style={styles.bentoInner}>
                <View style={styles.bentoHeader}>
                  <MaterialCommunityIcons name="account-group-outline" size={20} color={colors.primary} />
                  <FluidText variant="titleSm" color={colors.onSurface}>Участники</FluidText>
                </View>
                <View style={styles.membersRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <View key={i} style={styles.memberDot}>
                      <FluidText variant="labelSm" color={colors.primary}>{i}</FluidText>
                    </View>
                  ))}
                  <FluidText variant="labelSm" color={colors.outline} style={{ marginLeft: spacing.md }}>
                    +12 участников
                  </FluidText>
                </View>
              </View>
            </GlassCard>

            {/* Analytics placeholder */}
            <GlassCard style={styles.bentoCardFull} borderRadius={radii["2xl"]}>
              <View style={styles.bentoInner}>
                <View style={styles.bentoHeader}>
                  <MaterialCommunityIcons name="chart-line" size={20} color={colors.tertiary} />
                  <FluidText variant="titleSm" color={colors.onSurface}>Аналитика</FluidText>
                </View>
                <LinearGradient
                  colors={[colors.surfaceContainerHigh, colors.surfaceContainer]}
                  style={styles.chartPlaceholder}
                >
                  <FluidText variant="bodySm" color={colors.outline}>
                    Скоро: графики активности
                  </FluidText>
                </LinearGradient>
              </View>
            </GlassCard>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  layout: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 64,
    backgroundColor: colors.surfaceContainerLow,
    paddingTop: spacing["3xl"],
    alignItems: "center",
    gap: spacing.xl,
  },
  sidebarItem: {
    alignItems: "center",
    gap: spacing.sm,
  },
  wsIcon: {
    width: 44,
    height: 44,
    borderRadius: radii["2xl"],
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  wsIconActive: {
    backgroundColor: colors.primaryContainer,
  },
  activeBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.primary,
    position: "absolute",
    left: -8,
    top: 12,
  },
  content: { flex: 1 },
  contentInner: {
    padding: spacing["2xl"],
    paddingBottom: spacing["6xl"],
  },
  bentoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginTop: spacing["3xl"],
  },
  bentoCard: {
    flex: 1,
    minWidth: "40%",
  },
  bentoCardFull: {
    width: "100%",
  },
  bentoInner: {
    padding: spacing.xl,
  },
  bentoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  channelList: { gap: spacing.md },
  channelItem: {
    paddingVertical: spacing.sm,
  },
  integrationChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  integrationChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHighest,
  },
  membersRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  chartPlaceholder: {
    height: 80,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
