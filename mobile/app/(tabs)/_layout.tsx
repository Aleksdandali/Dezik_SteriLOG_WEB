import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { registerForPush } from '@/lib/notifications';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  useEffect(() => {
    registerForPush().catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.brand,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen name="orders" options={{ title: 'Замовлення' }} />
      <Tabs.Screen name="chat" options={{ title: 'Чат' }} />
      <Tabs.Screen name="create" options={{ title: 'Головна' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профіль' }} />
    </Tabs>
  );
}
