module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo wires up Expo Router (injects EXPO_ROUTER_APP_ROOT for the
  // require.context in expo-router/_ctx) and the reanimated worklets plugin.
  return {
    presets: ['babel-preset-expo'],
  };
};
