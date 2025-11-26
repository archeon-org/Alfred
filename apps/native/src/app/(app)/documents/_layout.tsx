import { Stack } from "expo-router";

export default function DocumentsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="search/index" options={{ presentation: "modal" }} />
    </Stack>
  );
}
