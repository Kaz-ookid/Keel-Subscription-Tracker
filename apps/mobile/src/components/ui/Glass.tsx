// THE glass surface for a control Keel draws itself: Apple's Liquid Glass on
// iOS 26 and later, the blur material below. Glass is for controls and
// navigation that float over content, never for content (cards and rows stay
// ui/Card), and never on top of other glass. A tint marks the screen's one
// primary action; everything else stays neutral. The shape is the style's
// borderRadius. Prefer the system control when one exists (tab bar, bar
// buttons, alerts): it is already glass.

import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { type ViewProps } from "react-native";

import { useGlass } from "../../lib/glass";
import { useTheme, withAlpha } from "../../theme";

interface Props extends ViewProps {
  /** Colours the glass: the primary action only. */
  tint?: string;
  /** The glass reacts to touch (a button). */
  interactive?: boolean;
}

export function Glass({ tint, interactive, style, children, ...rest }: Props) {
  const glass = useGlass();
  const { colors, scheme } = useTheme();
  if (glass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tint}
        isInteractive={interactive}
        // The app's own appearance choice, not the device's.
        colorScheme={scheme}
        style={style}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView
      intensity={50}
      tint={scheme === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
      style={[
        {
          backgroundColor: tint ? withAlpha(tint, 0.28) : colors.material,
          borderWidth: 1,
          borderColor: tint ? withAlpha(tint, 0.45) : colors.hairline,
          overflow: "hidden",
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </BlurView>
  );
}
