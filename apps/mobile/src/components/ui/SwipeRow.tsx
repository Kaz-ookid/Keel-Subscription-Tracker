// Mail-style swipe-to-delete, built to coexist with a native pager: while
// CLOSED the pan activates ONLY on a clearly-leftward drag and fails
// immediately rightward or vertically, so page swipes and list scrolls never
// feel blocked (the off-the-shelf Swipeable claimed both directions inside
// react-native-pager-view and read as "bugged"). Once a row is OPEN it owns
// rightward too: swiping back closes it rather than paging away. One row
// open at a time — opening a row closes the previous one — and while a row
// is open or mid-drag, its press action is suppressed: a tap then CLOSES
// the row instead of navigating.
//
// The host list must be the gesture-handler FlatList (not react-native's):
// that registers the scroll with the gesture system so a leftward drag can
// win against it instead of being cancelled the moment the list moves.

import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { SymbolView } from "expo-symbols";

import { radius, spacing, useTheme } from "../../theme";

const ACTION_W = 72;
const OPEN_X = -(ACTION_W + spacing.sm);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The one-open-at-a-time registry: each mounted row parks a close callback;
// a row starting to drag closes every other row first.
const closers = new Map<string, () => void>();
function closeOthers(except: string): void {
  closers.forEach((close, id) => {
    if (id !== except) close();
  });
}

/** Close every open swipe row. Wired to everything that moves attention
 *  elsewhere — the pager swiping, the list scrolling, the screen blurring —
 *  so a revealed trash button never survives a context change (an open row
 *  used to sit "stuck" through an edit round-trip). */
export function closeAllSwipeRows(): void {
  closers.forEach((close) => close());
}

interface Props {
  /** Stable identity for the single-open coordination. */
  rowId: string;
  onPress: () => void;
  /** The revealed action (already confirmed upstream if destructive). */
  onAction: () => void;
  actionIcon?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function SwipeRow({ rowId, onPress, onAction, actionIcon = "trash.fill", children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors.tones.danger), [colors.tones.danger]);
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  // JS-side mirror of "open or dragging", read synchronously by onPress.
  const engaged = useRef(false);
  const setEngaged = (value: boolean) => {
    engaged.current = value;
  };
  // The LATCHED state, as React state on purpose: the gesture's activation
  // offsets are fixed at creation, and an open row needs a different set
  // (rightward must belong to the row, so swiping back closes it instead
  // of paging away) — so open/close rebuilds the gesture between gestures.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    closers.set(rowId, () => {
      translateX.value = withTiming(0, { duration: 160 });
      engaged.current = false;
      setOpen(false);
    });
    return () => {
      closers.delete(rowId);
    };
  }, [rowId, translateX]);

  // Reanimated worklets mutate shared values by design; the react-hooks
  // immutability/refs rules can't see the worklet boundary, so they're
  // disabled for this block only.
  /* eslint-disable react-hooks/immutability, react-hooks/refs */
  const close = () => {
    translateX.value = withTiming(0, { duration: 160 });
    engaged.current = false;
    setOpen(false);
  };

  const handlePress = () => {
    // An open (or mid-drag) row swallows the tap and just closes.
    if (engaged.current) {
      close();
      return;
    }
    // Tapping a DIFFERENT row is also "attention moved": tidy the open one.
    closeOthers(rowId);
    onPress();
  };
  // The gesture is memoised per row; the tap reads the CURRENT handler
  // through this ref so it never closes over a stale onPress.
  const pressRef = useRef(handlePress);
  pressRef.current = handlePress;

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      // CLOSED: leftward only, and EAGER — the surrounding scroll surfaces
      // begin claiming around 10pt of travel, so activating any later loses
      // the race and the swipe reads as dead; rightward and vertical fail
      // instantly, keeping the pager and the list scroll native.
      // OPEN: rightward activates too — swiping back closes the row instead
      // of handing the drag to the pager (which paged away to Upcoming).
      .activeOffsetX(open ? [-10, 10] : [-10, Number.MAX_SAFE_INTEGER])
      .failOffsetX(open ? Number.MAX_SAFE_INTEGER : 10)
      .failOffsetY([-12, 12])
      .onStart(() => {
        startX.value = translateX.value;
        scheduleOnRN(closeOthers, rowId);
        scheduleOnRN(setEngaged, true);
      })
      .onUpdate((e) => {
        const raw = Math.min(0, startX.value + e.translationX);
        // Gentle resistance past the open position.
        translateX.value = raw < OPEN_X ? OPEN_X + (raw - OPEN_X) / 3 : raw;
      })
      .onEnd((e) => {
        // Latch open on position OR a leftward flick — a quick swipe releases
        // long before the halfway point and must still hold.
        const flickClose = e.velocityX > 400;
        const shouldOpen = !flickClose && (translateX.value < OPEN_X / 2 || e.velocityX < -400);
        if (shouldOpen) {
          translateX.value = withTiming(OPEN_X, { duration: 160 });
          scheduleOnRN(setOpen, true);
        } else {
          translateX.value = withTiming(0, { duration: 160 });
          scheduleOnRN(setEngaged, false);
          scheduleOnRN(setOpen, false);
        }
      });
    // The press is a gesture too, EXCLUSIVE with the pan: it can only win
    // once the pan has failed. A plain RN Pressable inside kept firing on
    // drag-release (touch-cancel never reaches it through the detector),
    // and that phantom press snapped the row shut the instant it latched
    // open. Inside the gesture system the race cannot exist.
    const firePress = () => pressRef.current();
    const tap = Gesture.Tap().onEnd((_e, success) => {
      if (success) scheduleOnRN(firePress);
    });
    return Gesture.Exclusive(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, open]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  // The rows are translucent material, so the pane can't just sit behind
  // them — it fades in with the drag and is fully gone at rest.
  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [OPEN_X * 0.6, 0], [1, 0], Extrapolation.CLAMP),
  }));
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

  const handleAction = () => {
    close();
    onAction();
  };

  return (
    <View style={styles.frame}>
      <AnimatedPressable
        style={[styles.action, actionStyle]}
        onPress={handleAction}
        accessibilityLabel="delete"
      >
        <SymbolView name={actionIcon as never} size={20} tintColor="#FFFFFF" />
      </AnimatedPressable>
      <GestureDetector gesture={gesture}>
        {/* The tap gesture IS the press — no Pressable inside, so nothing
            can fire on a drag's release. */}
        <Animated.View style={rowStyle} accessible accessibilityRole="button">
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function createStyles(danger: string) {
  return StyleSheet.create({
    frame: { position: "relative" },
    action: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: ACTION_W,
      borderRadius: radius.lg,
      backgroundColor: danger,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
