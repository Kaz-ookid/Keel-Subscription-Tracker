// The notification center: one in-app master switch, the default reminder
// (lead + hour) applied to new commitments and quick-adds, a preview button,
// and the live list of scheduled reminders with quick add/remove. The OS
// permission surfaces ONLY as an inline "allow" row when it's missing — no
// status theater. There is deliberately no "rebuild" button: every data
// change already rebuilds the whole schedule from scratch (see
// lib/notifications.ts).

import { formatCalendarDate, plannedReminders, today, formatMoney } from "@keel/core";
import { Picker as RNPicker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import { REMINDER_OPTIONS } from "../src/components/add-form/useAddForm";
import { IconChip } from "../src/components/ui/IconChip";
import { BrandBadge } from "../src/components/BrandBadge";
import { Sheet } from "../src/components/Sheet";
import { Card } from "../src/components/ui/Card";
import { WheelSheet } from "../src/components/WheelSheet";
import { formatHour } from "../src/lib/dates";
import { foldIn, foldLayout, foldOut } from "../src/lib/motion";
import { showNativeActionSheet } from "../src/lib/native-sheet";
import {
  DEFAULT_LEAD_OPTIONS,
  loadNotificationSettings,
  previewNotification,
  reminderPermissionGranted,
  requestReminderPermission,
  saveNotificationSettings,
  syncReminders,
  type DigestRule,
  type NotificationSettings,
} from "../src/lib/notifications";
import { useAppActions, useAppData } from "../src/state/app-state";
import { spacing, typography, useTheme, type ThemeColors } from "../src/theme";

const Picker = RNPicker as unknown as ComponentType<{
  selectedValue: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}> & { Item: typeof RNPicker.Item };

const CHIP = {
  master: "#FF3B30",
  allow: "#FF9500",
  lead: "#5856D6",
  hour: "#8E8E93",
  preview: "#30B0C7",
  add: "#34C759",
  digest: "#FF9500",
} as const;

/** Monday-first, the European reading order; values stay JS weekdays. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, categories } = useAppData();
  const { setItemReminder } = useAppActions();

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [hourSheet, setHourSheet] = useState(false);
  const [addSheet, setAddSheet] = useState(false);
  const [digestDaySheet, setDigestDaySheet] = useState(false);

  useEffect(() => {
    void loadNotificationSettings().then(setSettings);
  }, []);

  // The OS permission, re-checked when coming back from iOS Settings.
  useEffect(() => {
    const check = () => void reminderPermissionGranted().then(setGranted);
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  const update = (patch: Partial<NotificationSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveNotificationSettings(next).then(() => syncReminders(items));
  };

  const askPermission = async () => {
    const result = await requestReminderPermission();
    if (result === "blocked") {
      void Linking.openSettings();
      return;
    }
    setGranted(result === "granted");
    if (result === "granted") void syncReminders(items);
  };

  const leadLabel = (key: string) => {
    const option = REMINDER_OPTIONS.find((o) => o.value === key);
    return option ? t(option.labelKey, { count: option.count }) : "";
  };

  // The overdue digest: off, or a weekly/monthly rhythm. The frequency sheet
  // leads; picking Weekly opens the weekday sheet, Monthly the day wheel.
  const digestLabel = (rule: DigestRule) =>
    rule.mode === "off"
      ? t("common.none")
      : rule.mode === "weekly"
        ? `${t("notifCenter.digestWeekly")} · ${t(`weekdays.long.${rule.weekday}`)}`
        : `${t("notifCenter.digestMonthly")} · ${t("notifCenter.digestDayN", { day: rule.day })}`;

  const pickDigestWeekday = () =>
    showNativeActionSheet(
      {
        title: t("notifCenter.digestWeekly"),
        options: [...WEEKDAY_ORDER.map((d) => t(`weekdays.long.${d}`)), t("common.cancel")],
        cancelButtonIndex: WEEKDAY_ORDER.length,
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index < WEEKDAY_ORDER.length) {
          update({ digest: { mode: "weekly", weekday: WEEKDAY_ORDER[index] } });
        }
      },
    );

  const pickDigest = () =>
    showNativeActionSheet(
      {
        title: t("notifCenter.digestRow"),
        options: [
          t("common.none"),
          t("notifCenter.digestWeekly"),
          t("notifCenter.digestMonthly"),
          t("common.cancel"),
        ],
        cancelButtonIndex: 3,
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index === 0) update({ digest: { mode: "off" } });
        else if (index === 1) pickDigestWeekday();
        else if (index === 2) setDigestDaySheet(true);
      },
    );

  const pickLead = () => {
    const labels = DEFAULT_LEAD_OPTIONS.map((key) => leadLabel(key));
    showNativeActionSheet(
      {
        title: t("notifCenter.defaultLead"),
        options: [...labels, t("common.cancel")],
        cancelButtonIndex: labels.length,
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index < labels.length) update({ defaultLeadKey: DEFAULT_LEAD_OPTIONS[index] });
      },
    );
  };

  // The live plan, straight from core — the same source the scheduler reads.
  const planned = useMemo(
    () =>
      settings?.enabled
        ? plannedReminders(items, today()).sort((a, b) => (a.fireDate < b.fireDate ? -1 : 1))
        : [],
    [items, settings?.enabled],
  );

  // Quick-add candidates: active commitments without a reminder rule.
  const candidates = useMemo(
    () => items.filter((i) => i.status === "active" && !i.reminder),
    [items],
  );

  const quickAdd = (id: string) => {
    if (!settings) return;
    setItemReminder(id, Number(settings.defaultLeadKey));
    setAddSheet(false);
  };

  const openPlanned = (paymentItemId: string, name: string) => {
    const item = items.find((i) => i.id === paymentItemId);
    const removable = !!item?.reminder;
    const options = removable
      ? [t("notifCenter.openItem"), t("notifCenter.removeReminder"), t("common.cancel")]
      : [t("notifCenter.openItem"), t("common.cancel")];
    showNativeActionSheet(
      {
        title: name,
        options,
        destructiveButtonIndex: removable ? 1 : undefined,
        cancelButtonIndex: options.length - 1,
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index === 0) router.push({ pathname: "/item", params: { id: paymentItemId } });
        else if (removable && index === 1) setItemReminder(paymentItemId, null);
      },
    );
  };

  const preview = async () => {
    const next = planned[0];
    const ok = await previewNotification(
      next ? { name: next.name, amount: next.amount, dueDate: next.dueDate } : null,
    );
    if (!ok) Alert.alert(t("notifCenter.previewFailTitle"), t("notifCenter.previewFailMsg"));
  };

  if (!settings) return <View style={styles.screen} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.largeTitle}>{t("notifCenter.title")}</Text>

      <Card style={styles.group}>
        <View style={styles.row}>
          <IconChip icon="bell.fill" color={CHIP.master} />
          <Text style={styles.rowText}>{t("notifCenter.master")}</Text>
          <Switch
            value={settings.enabled}
            onValueChange={(next) => update({ enabled: next })}
            trackColor={{ true: colors.accent }}
          />
        </View>
        {settings.enabled && granted === false && (
          <Animated.View entering={foldIn} exiting={foldOut}>
            <Pressable style={[styles.row, styles.rowDivider]} onPress={() => void askPermission()}>
              <IconChip icon="exclamationmark.triangle.fill" color={CHIP.allow} />
              <Text style={[styles.rowText, { color: colors.tones.warning }]}>
                {t("notifCenter.allow")}
              </Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
          </Animated.View>
        )}
      </Card>

      {settings.enabled && (
        <Animated.View entering={foldIn} exiting={foldOut} layout={foldLayout} style={styles.gap}>
          <Text style={styles.groupLabel}>{t("notifCenter.defaultGroup")}</Text>
          <Card style={styles.group}>
            <Pressable style={styles.row} onPress={pickLead}>
              <IconChip icon="calendar.badge.clock" color={CHIP.lead} />
              <Text style={styles.rowText}>{t("notifCenter.defaultLead")}</Text>
              <Text style={styles.rowValue}>{leadLabel(settings.defaultLeadKey)}</Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
            <Pressable style={[styles.row, styles.rowDivider]} onPress={() => setHourSheet(true)}>
              <IconChip icon="clock.fill" color={CHIP.hour} />
              <Text style={styles.rowText}>{t("notifCenter.hour")}</Text>
              <Text style={styles.rowValue}>{formatHour(settings.fireHour)}</Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
            <Text style={styles.footnote}>{t("notifCenter.defaultFooter")}</Text>
          </Card>

          <Text style={styles.groupLabel}>{t("notifCenter.digestGroup")}</Text>
          <Card style={styles.group}>
            <Pressable style={styles.row} onPress={pickDigest}>
              <IconChip icon="clock.badge.exclamationmark" color={CHIP.digest} />
              <Text style={styles.rowText}>{t("notifCenter.digestRow")}</Text>
              <Text style={styles.rowValue}>{digestLabel(settings.digest)}</Text>
              <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
            </Pressable>
            <Text style={styles.footnote}>{t("notifCenter.digestFooter")}</Text>
          </Card>

          <Text style={styles.groupLabel}>{t("notifCenter.scheduledGroup")}</Text>
          <Card style={styles.group}>
            {planned.length === 0 ? (
              <Text style={styles.footnote}>{t("notifCenter.nothingScheduled")}</Text>
            ) : (
              planned.map((reminder, i) => (
                <Pressable
                  key={`${reminder.paymentItemId}-${reminder.kind}`}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                  onPress={() => openPlanned(reminder.paymentItemId, reminder.name)}
                >
                  <View style={styles.rowMiddle}>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {reminder.name}
                    </Text>
                    <Text style={styles.rowSub}>
                      {t("notifCenter.firesOn", {
                        date: formatCalendarDate(reminder.fireDate),
                        amount: formatMoney(reminder.amount),
                      })}
                    </Text>
                  </View>
                  <SymbolView name="chevron.right" size={13} tintColor={colors.mutedText} />
                </Pressable>
              ))
            )}
            {candidates.length > 0 && (
              <Pressable
                style={[styles.row, planned.length > 0 && styles.rowDivider]}
                onPress={() => setAddSheet(true)}
              >
                <IconChip icon="plus" color={CHIP.add} />
                <Text style={[styles.rowText, { color: colors.accent }]}>
                  {t("notifCenter.addReminder")}
                </Text>
              </Pressable>
            )}
          </Card>

          <Card style={styles.group}>
            <Pressable style={styles.row} onPress={() => void preview()}>
              <IconChip icon="bell.and.waves.left.and.right" color={CHIP.preview} />
              <Text style={[styles.rowText, { color: colors.accent }]}>
                {t("notifCenter.preview")}
              </Text>
            </Pressable>
          </Card>
        </Animated.View>
      )}

      {/* The quick-add picker: real rows with the brand's face, not a bare
          ActionSheet — picking one applies the default lead and closes. */}
      <Sheet
        visible={addSheet}
        title={t("notifCenter.addReminder")}
        closeLabel={t("common.close")}
        onClose={() => setAddSheet(false)}
      >
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <Text style={styles.footnote}>
            {t("notifCenter.addReminderMsg", { lead: leadLabel(settings.defaultLeadKey) })}
          </Text>
          {candidates.map((item, i) => {
            const category = categories.find((c) => c.id === item.categoryId);
            return (
              <Pressable
                key={item.id}
                style={[styles.row, i > 0 && styles.rowDivider]}
                onPress={() => quickAdd(item.id)}
              >
                <BrandBadge
                  domain={item.domain}
                  icon={category?.icon}
                  fallback={item.name.charAt(0).toUpperCase()}
                  color={item.color ?? colors.accent}
                  size={32}
                />
                <Text style={styles.rowText} numberOfLines={1}>
                  {item.name}
                </Text>
                <SymbolView name="plus.circle.fill" size={20} tintColor={colors.accent} />
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>

      <WheelSheet
        visible={hourSheet}
        title={t("notifCenter.hour")}
        onClose={() => setHourSheet(false)}
      >
        <Picker
          selectedValue={String(settings.fireHour)}
          onValueChange={(v) => update({ fireHour: Number(v) })}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <Picker.Item
              key={hour}
              label={formatHour(hour)}
              value={String(hour)}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>

      <WheelSheet
        visible={digestDaySheet}
        title={t("notifCenter.digestMonthly")}
        onClose={() => setDigestDaySheet(false)}
      >
        <Picker
          selectedValue={String(settings.digest.mode === "monthly" ? settings.digest.day : 1)}
          onValueChange={(v) => update({ digest: { mode: "monthly", day: Number(v) } })}
        >
          {/* 1..28 so every month has the day — no clamping surprises. */}
          {Array.from({ length: 28 }, (_, i) => (
            <Picker.Item
              key={i + 1}
              label={t("notifCenter.digestDayN", { day: i + 1 })}
              value={String(i + 1)}
              color={colors.text}
            />
          ))}
        </Picker>
      </WheelSheet>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "transparent" },
    content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    sheetContent: { padding: spacing.md },
    largeTitle: { fontSize: 34, fontWeight: "700", color: colors.text },
    gap: { gap: spacing.md },
    group: {},
    groupLabel: {
      ...typography.micro,
      color: colors.mutedText,
      marginBottom: -spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    rowMiddle: { flex: 1, gap: 1 },
    rowText: {
      ...typography.body,
      color: colors.text,
      flex: 1,
    },
    rowSub: { ...typography.caption, color: colors.mutedText },
    rowValue: {
      ...typography.body,
      color: colors.mutedText,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    footnote: {
      ...typography.caption,
      color: colors.mutedText,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
    },
  });
}
