import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Text, View } from "react-native";

import { useTheme } from "../theme";

interface Props {
  /** SF Symbol name; when absent the badge shows `fallback` as text. */
  icon?: string;
  /** Text shown when there's no icon — typically the name's first letter. */
  fallback?: string;
  /** Badge background — the item/account/category accent colour. */
  color: string;
  size?: number;
}

/** The circular icon badge used on every card row (subscriptions, upcoming
 *  charges, accounts). Owns the SF-Symbol name cast so call sites stay clean. */
export function IconBadge({ icon, fallback, color, size = 44 }: Props) {
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
        <Text
          style={{ color: colors.white, fontSize: Math.round(size * 0.45), fontWeight: "700" }}
        >
          {fallback}
        </Text>
      )}
    </View>
  );
}
