// The badge used wherever a commitment might be a known brand: fetches the
// real logo from the brand's domain (cached on disk after the first load) and
// falls back to the plain IconBadge — brand colour + letter, or the category
// icon — while loading, offline before any cache exists, or on fetch failure.

import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";

import { logoUrl } from "../lib/logos";
import { useTheme } from "../theme";
import { IconBadge } from "./IconBadge";

interface Props {
  /** Brand website ("netflix.com"); absent → straight to IconBadge. */
  domain?: string;
  /** IconBadge fallbacks — see that component. */
  icon?: string;
  fallback?: string;
  color: string;
  size?: number;
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
    return <IconBadge icon={icon} fallback={fallback} color={color} size={size} />;
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* The fallback badge sits underneath until the logo has actually
          rendered — no blank circle while fetching. */}
      {!loaded && (
        <View style={{ position: "absolute" }}>
          <IconBadge icon={icon} fallback={fallback} color={color} size={size} />
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
