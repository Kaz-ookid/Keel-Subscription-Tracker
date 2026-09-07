// THE badge (DESIGN.md §3.4): the one circular identity mark for items,
// accounts and categories. With a `domain` it shows the real brand logo, over a
// plain fallback (brand colour + letter, or the given icon) shown while loading,
// on failure, or when there is no logo to show.
//
// Web logos are opt-in (see logo-consent). When ON, a domain's logo is fetched
// and disk-cached. When OFF, we NEVER fetch — but a logo already on disk still
// shows, because displaying a local file sends nothing to the network (the
// domain already left the device when it was first fetched, with permission).
// So turning logos off stops new lookups without throwing away the ones already
// downloaded; a brand never fetched simply shows its plain badge.

import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { monoPolarity, noteBrandLogo, useBrandTints } from "../lib/dominant-color";
import { useLogosEnabled } from "../lib/logo-consent";
import {
  hostOf,
  knownCachedLogo,
  logoCacheKey,
  logoUrl,
  lookupCachedLogo,
  noteLogoCached,
} from "../lib/logos";
import { contrastText, useTheme } from "../theme";

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

/** An `icon` value that is an emoji, not an SF Symbol token. Symbol names
 *  are plain ASCII ("tv.fill"); anything beyond is a mark to draw as text. */
export function isEmojiMark(icon: string): boolean {
  return /[^\x20-\x7E]/.test(icon);
}

/** The plain circle: colour + icon, emoji or letter. Owns the SF-Symbol name
 *  cast so call sites stay clean. */
function FallbackBadge({ icon, fallback, color, size }: Omit<Props, "domain"> & { size: number }) {
  // The glyph must read on ANY brand/user color — forced white died on the
  // pale swatches (yellow, mint). contrastText picks per background.
  const mark = contrastText(color);
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
      {icon && isEmojiMark(icon) ? (
        // An emoji carries its own colors — no tint, a touch larger.
        <Text style={{ fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.7) }}>
          {icon}
        </Text>
      ) : icon ? (
        <SymbolView
          name={icon as SymbolViewProps["name"]}
          size={Math.round(size / 2)}
          tintColor={mark}
        />
      ) : (
        <Text style={{ color: mark, fontSize: Math.round(size * 0.45), fontWeight: "700" }}>
          {fallback}
        </Text>
      )}
    </View>
  );
}

export function BrandBadge({ domain, icon, fallback, color, size = 44 }: Props) {
  const { colors } = useTheme();
  const logosEnabled = useLogosEnabled();
  // Repaint when a tint or mono verdict lands for this domain.
  useBrandTints();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // When web logos are OFF, the local URI of an already-cached logo (null =
  // known absent; undefined = this host was never probed this session). Seeded
  // from the session memo, so after the first probe a remounting badge knows
  // its answer in the SAME frame — no monogram flash on screen changes.
  const [cachedUri, setCachedUri] = useState<string | null | undefined>(() =>
    domain ? knownCachedLogo(domain) : undefined,
  );

  // A transient fetch failure (offline blip, the favicon service throttling
  // a burst) must not pin the monogram until a remount: one quiet retry per
  // domain, a beat later.
  const [retried, setRetried] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  // Re-fetch when the brand changes (e.g. typing a domain in the identity
  // sheet): without this, a previous load/failure pins the badge to the wrong
  // state and the new logo only appears after a remount/relaunch. React's
  // "reset state when a prop changes" during render — no effect needed.
  const [prevDomain, setPrevDomain] = useState(domain);
  if (domain !== prevDomain) {
    setPrevDomain(domain);
    setLoaded(false);
    setFailed(false);
    setRetried(false);
    setCachedUri(domain ? knownCachedLogo(domain) : undefined);
  }

  // OFF + a domain not probed yet: ask the disk cache ONCE (memoised in
  // lib/logos) — a hit keeps the logo the user already had, a miss falls
  // through to the plain badge. (When ON we fetch directly, skipping this.)
  useEffect(() => {
    if (!domain || logosEnabled || cachedUri !== undefined) return;
    let alive = true;
    void lookupCachedLogo(domain).then((uri) => alive && setCachedUri(uri));
    return () => {
      alive = false;
    };
  }, [domain, logosEnabled, cachedUri]);

  // No domain, or one still being typed ("net", "netflix.c"): the plain
  // badge, with no fetch — half-typed hosts flashed wrong logos and burned
  // requests on every keystroke.
  if (!domain || !/\.[a-z]{2,}$/i.test(hostOf(domain))) {
    return <FallbackBadge icon={icon} fallback={fallback} color={color} size={size} />;
  }

  // ON → fetch the logo; OFF → only a copy already on disk (a file:// URI).
  const uri = failed ? undefined : logosEnabled ? logoUrl(domain) : (cachedUri ?? undefined);

  if (!uri) {
    return <FallbackBadge icon={icon} fallback={fallback} color={color} size={size} />;
  }

  // A logo this session has already shown paints from the memory cache in
  // the same frame — putting the colored circle underneath anyway made every
  // remount (the calendar's many small badges) flash brand color first.
  const expectInstant = logosEnabled ? knownCachedLogo(domain) != null : cachedUri != null;

  // The plate under a loaded logo. Colored logos are designed for light
  // plates → white, always. A KNOWN mono logo gets the contrasting plate
  // (light mark → navy, dark mark → white). Unknown stays white: most
  // unextracted logos are colored, and navy would look off under them.
  const polarity = monoPolarity(domain);
  const plateColor = polarity === "light" ? colors.navy : colors.white;

  return (
    <View style={{ width: size, height: size }}>
      {/* The fallback badge sits underneath until the logo has actually
          rendered — no blank circle while fetching, no color flash when the
          logo is already at hand. */}
      {!loaded && !expectInstant && (
        <View style={{ position: "absolute" }}>
          <FallbackBadge icon={icon} fallback={fallback} color={color} size={size} />
        </View>
      )}
      <Image
        source={{ uri, cacheKey: logoCacheKey(domain) }}
        // A domain change must not keep painting the previous brand while the
        // new logo loads — the native view recycles its texture otherwise
        // (the identity sheet showed the old logo after editing the website).
        recyclingKey={logoCacheKey(domain)}
        // Memory + disk: a logo shown once this session re-renders from RAM in
        // the same frame on later mounts, instead of a per-mount disk read
        // (which is what made every screen change blink).
        cachePolicy="memory-disk"
        onLoad={() => {
          setLoaded(true);
          if (logosEnabled) noteLogoCached(domain);
          // The one moment we KNOW the logo renders: extract its dominant
          // color (once per domain; a no-op without the native module).
          noteBrandLogo(domain, uri);
        }}
        onError={() => {
          setFailed(true);
          if (!retried) {
            setRetried(true);
            retryTimer.current = setTimeout(() => setFailed(false), 1500);
          }
        }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: loaded ? plateColor : "transparent",
        }}
        contentFit="cover"
      />
    </View>
  );
}
