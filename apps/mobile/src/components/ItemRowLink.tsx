// THE pressable shell of a row that stands for an item (All, Upcoming): a
// tap opens the item, a long press opens the system context menu (the one
// an app icon has), which plays its own haptic. It replaced the swipe to
// delete (retex 2026-11-15). Every menu action is a WRITE: locked, it lands
// on the locked sheet instead. The delete alert stays.

import { canCancel, isPaymentItemComplete, isRecurringSchedule } from "@keel/core";
import { Link, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, type ViewStyle } from "react-native";

import { useCancelFlow } from "../lib/cancel-flow";
import { useLockGuard } from "../lib/lock-gate";
import { useAppActions, useAppData } from "../state/app-state";

interface Props {
  itemId: string;
  /** The card: its ground and corners are what the menu lifts. ONE plain
   *  style object, no array and no function: the link merges styles into
   *  its child and would drop either. */
  style: ViewStyle;
  /** The row's content; `pressed` is there for the same reason. */
  children: (pressed: boolean) => ReactNode;
}

export function ItemRowLink({ itemId, style, children }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const { items } = useAppData();
  const { pauseSubscription, resumeSubscription, removeSubscription } = useAppActions();
  const { askCancel } = useCancelFlow();
  const guard = useLockGuard();

  const item = items.find((i) => i.id === itemId);
  const paused = item?.status === "paused";
  // The item screen's own condition for Pause and Cancel.
  const live = !!item && !isPaymentItemComplete(item) && isRecurringSchedule(item.schedule);
  const confirmDelete = () => {
    Alert.alert(t("row.deleteTitle"), t("row.deleteAsk", { name: item?.name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeSubscription(itemId) },
    ]);
  };

  return (
    <Link href={{ pathname: "/item", params: { id: itemId } }} asChild>
      <Link.Trigger>
        <Pressable style={style}>{({ pressed }) => children(pressed)}</Pressable>
      </Link.Trigger>
      <Link.Menu>
        <Link.MenuAction
          icon="pencil"
          onPress={guard(() => router.push({ pathname: "/add/form", params: { id: itemId } }))}
        >
          {t("common.edit")}
        </Link.MenuAction>
        <Link.MenuAction
          icon={paused ? "play" : "pause"}
          hidden={!live}
          onPress={guard(() => (paused ? resumeSubscription(itemId) : pauseSubscription(itemId)))}
        >
          {paused ? t("item.resume") : t("item.pause")}
        </Link.MenuAction>
        <Link.MenuAction
          icon="xmark.circle"
          hidden={!live || !canCancel(item) || !!item.cancelPlan}
          onPress={guard(() => item && askCancel(item))}
        >
          {t("cancel.start")}
        </Link.MenuAction>
        <Link.MenuAction icon="trash" destructive onPress={guard(confirmDelete)}>
          {t("common.delete")}
        </Link.MenuAction>
      </Link.Menu>
    </Link>
  );
}
