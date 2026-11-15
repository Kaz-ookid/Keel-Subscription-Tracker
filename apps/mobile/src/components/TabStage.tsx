// The ground of a tab screen: the app background with its own Ambient stage.
// The native tab bar hosts each tab in its own native view, so the root
// layout's stage cannot be relied on to show through (the Add sheet carries
// its own for the same reason).

import { type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../theme";
import { Ambient } from "./Ambient";

interface Props {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function TabStage({ style, children }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      <Ambient />
      {children}
    </View>
  );
}
