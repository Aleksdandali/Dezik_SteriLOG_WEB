import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { registerForPush } from '@/lib/notifications';

export default function TabsLayout() {
  useEffect(() => {
    registerForPush().catch(() => {});
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="orders" options={{ title: 'Замовлення' }} />
      <Tabs.Screen name="chat" options={{ title: 'Чат' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профіль' }} />
    </Tabs>
  );
}
