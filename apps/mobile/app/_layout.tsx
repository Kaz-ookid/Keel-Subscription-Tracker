import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { SubscriptionsProvider } from "../src/state/subscriptions";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SubscriptionsProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.navy },
            headerTintColor: colors.white,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="add"
            options={{ presentation: "modal", title: "New subscription" }}
          />
        </Stack>
        <StatusBar style="light" />
      </SubscriptionsProvider>
    </GestureHandlerRootView>
  );
}
