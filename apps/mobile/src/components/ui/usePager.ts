// THE horizontal pager (Payments' Upcoming/All, the import hub): a plain
// paging ScrollView with bounces off, so a UIScrollView is physically
// clamped to its pages and nothing can wrap. The hook owns the settle rules
// that were learned the hard way (dogfood 2026-10-11): a release with
// momentum settles in onMomentumScrollEnd, and only a dead-stop release
// settles from onScrollEndDrag, or a fast reverse swipe teleports to the
// wrong page. `progress` is the live position in pages, for a pill wash
// (SegmentedPills' `progress` prop) to follow the finger.

import { useMemo, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

export interface Pager {
  /** Live position in pages (0..count-1), driven by the scroll itself. */
  progress: SharedValue<number>;
  /** The settled page. */
  page: number;
  goTo: (page: number, animated?: boolean) => void;
  /** Spread onto the paging ScrollView. */
  scrollProps: {
    horizontal: true;
    pagingEnabled: true;
    bounces: false;
    showsHorizontalScrollIndicator: false;
    scrollEventThrottle: number;
    contentOffset: { x: number; y: number };
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  };
}

export function usePager({
  ref,
  pageWidth,
  pageCount,
  initialPage = 0,
  mountKey,
  onSettle,
}: {
  /** The caller's own ref on the paging ScrollView (passed as `ref=`). */
  ref: React.RefObject<ScrollView | null>;
  pageWidth: number;
  pageCount: number;
  initialPage?: number;
  /** The offset the pager MOUNTS with is applied once per mount; pass what
   *  remounts it (Payments: leaving and returning from the calendar) so a
   *  page change mid-gesture never re-applies the prop and yanks the scroll. */
  mountKey?: unknown;
  onSettle?: (page: number) => void;
}): Pager {
  const [page, setPage] = useState(initialPage);
  const progress = useSharedValue(initialPage);
  const last = pageCount - 1;

  const contentOffset = useMemo(
    () => ({ x: initialPage * pageWidth, y: 0 }),
    // Deliberately not tied to initialPage: see mountKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mountKey, pageWidth],
  );

  // Reanimated shared values are driven by assigning `.value` from scroll
  // handlers: the library's API, not a state mutation to police.
  const settle = (next: number) => {
    setPage(next);
    progress.value = next;
    onSettle?.(next);
  };
  const goTo = (next: number, animated = true) => {
    setPage(next);
    // An animated scroll's own events carry `progress` along.
    if (!animated) progress.value = next;
    ref.current?.scrollTo({ x: next * pageWidth, animated });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    progress.value = Math.min(last, Math.max(0, e.nativeEvent.contentOffset.x / pageWidth));
  };
  const pageAt = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.min(last, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / pageWidth)));
  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => settle(pageAt(e));
  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) settle(pageAt(e));
  };

  return {
    progress,
    page,
    goTo,
    scrollProps: {
      horizontal: true,
      pagingEnabled: true,
      bounces: false,
      showsHorizontalScrollIndicator: false,
      scrollEventThrottle: 16,
      contentOffset,
      onScroll,
      onMomentumScrollEnd,
      onScrollEndDrag,
    },
  };
}
