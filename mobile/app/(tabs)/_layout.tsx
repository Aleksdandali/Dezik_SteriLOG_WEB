import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { registerForPush } from '@/lib/notifications';
import { colors } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  focused,
  color,
  size,
}: {
  name: IconName;
  focused: boolean;
  color: string;
  size: number;
}) {
  const iconName = (focused ? name : `${name}-outline`) as IconName;
  return <Ionicons name={iconName} color={color} size={size} />;
}

export default function TabsLayout() {
  useEffect(() => {
    registerForPush().catch(() => {});
  }, []);

  return (
    <Tabs
      initialRouteName="create"
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.brand,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.divider,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="create"
        options={{
          title: 'Головна',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="home" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Замовлення',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="receipt" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Чат',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="chatbubble-ellipses" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профіль',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="person-circle" focused={focused} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
