// Mail-style swipe-to-delete, built to coexist with a native pager: the pan
// activates ONLY on a clearly-leftward drag and fails immediately rightward
// or vertically, so page swipes and list scrolls never feel blocked (the
// off-the-shelf Swipeable claimed both directions inside react-native-
// pager-view and read as "bugged"). One row open at a time — opening a row
// closes the previous one — and while a row is open or mid-drag, its press
// action is suppressed: a tap then CLOSES the row instead of navigating.

import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";

import { radius, spacing, useTheme } from "../../theme";

const ACTION_W = 72;
const OPEN_X = -(ACTION_W + spacing.sm);

// The one-open-at-a-time registry: each mounted row parks a close callback;
// a row starting to drag closes every other row first.
const closers = new Map<string, () => void>();
function closeOthers(except: string): void {
  closers.forEach((close, id) => {
    if (id !== except) close();
  });
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

  useEffect(() => {
    closers.set(rowId, () => {
      translateX.value = withTiming(0, { duration: 160 });
      engaged.current = false;
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
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Leftward only: rightward and vertical fail instantly so the pager and
        // the list scroll keep their native feel.
        .activeOffsetX([-16, Number.MAX_SAFE_INTEGER])
        .failOffsetX(12)
        .failOffsetY([-12, 12])
        .onStart(() => {
          startX.value = translateX.value;
          runOnJS(closeOthers)(rowId);
          runOnJS(setEngaged)(true);
        })
        .onUpdate((e) => {
          const raw = Math.min(0, startX.value + e.translationX);
          // Gentle resistance past the open position.
          translateX.value = raw < OPEN_X ? OPEN_X + (raw - OPEN_X) / 3 : raw;
        })
        .onEnd(() => {
          if (translateX.value < OPEN_X / 2) {
            translateX.value = withTiming(OPEN_X, { duration: 160 });
          } else {
            translateX.value = withTiming(0, { duration: 160 });
            runOnJS(setEngaged)(false);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowId],
  );
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const handlePress = () => {
    // An open (or mid-drag) row swallows the tap and just closes.
    if (engaged.current) {
      close();
      return;
    }
    onPress();
  };

  const handleAction = () => {
    close();
    onAction();
  };

  return (
    <View style={styles.frame}>
      <Pressable style={styles.action} onPress={handleAction} accessibilityLabel="delete">
        <SymbolView name={actionIcon as never} size={20} tintColor="#FFFFFF" />
      </Pressable>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <Pressable onPress={handlePress}>{children}</Pressable>
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
