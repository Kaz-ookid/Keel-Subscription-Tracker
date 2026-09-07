// Dynamic Type with a ceiling: text follows the user's system size up to
// ~1.3×, then stops. Unbounded scaling (accessibility sizes reach 3×+) tore
// every dense layout apart — dock labels, wheels, the harbor bubbles — and
// per-callsite `maxFontSizeMultiplier` on 66 files is unmaintainable.
//
// The classic global cap (`Text.defaultProps`) is dead: React 19 ignores
// defaultProps on function components, and RN's Text/TextInput are exactly
// that. So the cap is applied at the module boundary instead: Metro
// compiles `import { Text } from "react-native"` into a property access on
// the shared module object AT USE TIME, so redefining that property early
// (root layout module scope, before the first render) hands every consumer
// a wrapped component. The wrapper spreads the caller's props AFTER the
// default, so an explicit multiplier on a call site still wins.

import { createElement, type ComponentType } from "react";

const MAX_FONT_SCALE = 1.3;

// The real module object (a namespace import would hand us a copy).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reactNative = require("react-native") as Record<string, unknown>;

for (const name of ["Text", "TextInput"] as const) {
  const Original = reactNative[name] as ComponentType<Record<string, unknown>>;
  const Capped = (props: Record<string, unknown>) =>
    createElement(Original, { maxFontSizeMultiplier: MAX_FONT_SCALE, ...props });
  Capped.displayName = `FontScaleCapped(${name})`;
  try {
    Object.defineProperty(reactNative, name, {
      configurable: true,
      enumerable: true,
      get: () => Capped,
    });
  } catch {
    // A future RN making the export non-configurable must degrade to
    // "uncapped text", never to a crash on launch.
  }
}
