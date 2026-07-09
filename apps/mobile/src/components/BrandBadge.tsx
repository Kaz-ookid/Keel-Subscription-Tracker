// THE badge (DESIGN.md §3.4): the one circular identity mark for items,
// accounts and categories. With a `domain` it fetches the real brand logo
// (cached on disk after the first load) and falls back to the plain badge —
// brand colour + letter, or the given icon — while loading, offline before any
// cache exists, or on fetch failure. Without a domain it renders the plain
// badge directly.

import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState } from "react";
import { Text, View } from "react-native";

import { logoUrl } from "../lib/logos";
import { useTheme } from "../theme";

interface Props {
  /** Brand website ("netflix.com"); absent → straight to the plain badge. */
  domain?: string;
  /** SF Symbol shown on the plain badge; when absent, `fallback` text shows. */
  icon?: string;
  /** Text when there's no icon — typically the name's first letter. */
  fallback?: string;
  /** Badge background — the item/account/category accent colour. */
  color: string;
  size?: number;
}

/** The plain circle: colour + icon or letter. Owns the SF-Symbol name cast so
 *  call sites stay clean. */
function FallbackBadge({ icon, fallback, color, size }: Omit<Props, "domain"> & { size: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon ? (
        <SymbolView
          name={icon as SymbolViewProps["name"]}
          size={Math.round(size / 2)}
          tintColor={colors.white}
        />
      ) : (
        <Text style={{ color: colors.white, fontSize: Math.round(size * 0.45), fontWeight: "700" }}>
          {fallback}
        </Text>
      )}
    </View>
  );
}

export function BrandBadge({ domain, icon, fallback, color, size = 44 }: Props) {
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Re-fetch when the brand changes (e.g. typing a domain in the identity
  // sheet): without this, a previous load/failure pins the badge to the wrong
  // state and the new logo only appears after a remount/relaunch. React's
  // "reset state when a prop changes" during render — no effect needed.
  const [prevDomain, setPrevDomain] = useState(domain);
  if (domain !== prevDomain) {
    setPrevDomain(domain);
    setLoaded(false);
    setFailed(false);
  }

  if (!domain || failed) {
    return <FallbackBadge icon={icon} fallback={fallback} color={color} size={size} />;
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* The fallback badge sits underneath until the logo has actually
          rendered — no blank circle while fetching. */}
      {!loaded && (
        <View style={{ position: "absolute" }}>
          <FallbackBadge icon={icon} fallback={fallback} color={color} size={size} />
        </View>
      )}
      <Image
        source={{ uri: logoUrl(domain) }}
        cachePolicy="disk"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: loaded ? colors.white : "transparent",
        }}
        contentFit="cover"
      />
    </View>
  );
}
