// The task-sheet close, top LEFT on sheet screens with no screen behind them:
// the system's own bar button with the standard xmark, so iOS draws its glass
// and places it. Render it in the screen body; it shows in the header.
//
// History: custom header glyphs drifted off-center for twelve dogfood rounds
// and the rule became "text only". System bar items ended that: the glyph is
// the system's again, never a view of ours inside the bar.

import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

export function ModalClose() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button
        icon="xmark"
        accessibilityLabel={t("common.close")}
        onPress={() => router.back()}
      />
    </Stack.Toolbar>
  );
}
