import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, radius, spacing, text } from '@/lib/theme';

type Action = {
  emoji: string;
  title: string;
  subtitle: string;
  href: '/expense/new' | '/audit/new' | '/supplier-payment/new' | '/movement/new';
};

const ACTIONS: Action[] = [
  { emoji: '💰', title: 'Витрата', subtitle: 'Сума + фото чека', href: '/expense/new' },
  { emoji: '🏭', title: 'Оплата постачальнику', subtitle: 'Постачальник + сума', href: '/supplier-payment/new' },
  { emoji: '📦', title: 'Переміщення', subtitle: 'Між складами + фото', href: '/movement/new' },
  { emoji: '📝', title: 'Переоблік', subtitle: 'Залишки на локації', href: '/audit/new' },
];

export default function CreateScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {ACTIONS.map(a => (
          <Pressable
            key={a.href}
            onPress={() => router.push(a.href)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Text style={styles.emoji}>{a.emoji}</Text>
            <View style={styles.cardBody}>
              <Text style={styles.title}>{a.title}</Text>
              <Text style={styles.subtitle}>{a.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  cardPressed: { opacity: 0.6 },
  emoji: { fontSize: 32 },
  cardBody: { flex: 1, gap: 2 },
  title: { ...text.heading },
  subtitle: { ...text.meta },
  chevron: { fontSize: 28, color: colors.textFaint, fontWeight: '300' },
});
