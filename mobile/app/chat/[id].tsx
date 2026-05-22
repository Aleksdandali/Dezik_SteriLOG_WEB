import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/lib/api';
import {
  cacheConversation,
  getCachedConversation,
  loadMessages,
  markConversationRead,
  sendMessage,
  type ChatConversation,
  type ChatMessage,
} from '@/lib/chat';
import { colors, radius, spacing, text } from '@/lib/theme';

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cached = id ? getCachedConversation(id) : undefined;
  const [conversation, setConversation] = useState<ChatConversation | undefined>(cached);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { messages: data } = await loadMessages(id);
      // Server returns ASC (chronological). For an inverted FlatList we display newest first.
      setMessages([...data].reverse());
      markConversationRead(id);
    } catch (e) {
      Alert.alert('Помилка', e instanceof ApiError ? e.message : 'Не вдалось завантажити');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const txt = draft.trim();
    if (!txt || !id || sending) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await sendMessage(id, txt);
      setMessages(prev => [msg, ...prev]); // inverted list: prepend = appears at bottom
      if (conversation) {
        const updated = {
          ...conversation,
          last_message_at: msg.created_at,
          last_message_preview: txt.length > 100 ? txt.slice(0, 100) + '...' : txt,
          last_message_sender: 'manager',
        };
        cacheConversation(updated);
        setConversation(updated);
      }
    } catch (e) {
      setDraft(txt); // restore draft on error
      Alert.alert('Помилка', e instanceof ApiError ? e.message : 'Не вдалось надіслати');
    } finally {
      setSending(false);
    }
  };

  const closeChat = () => {
    Alert.alert('Завершити чат?', 'Клієнту буде надіслано системне повідомлення.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Завершити',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            const msg = await sendMessage(id, '— Чат завершено —');
            setMessages(prev => [msg, ...prev]);
          } catch (e) {
            Alert.alert('Помилка', e instanceof ApiError ? e.message : 'Не вдалось завершити');
          }
        },
      },
    ]);
  };

  const title = conversation?.customer_name ?? conversation?.customer_phone ?? `#${id}`;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title,
          headerTintColor: colors.brand,
          headerRight: () => (
            <Pressable onPress={closeChat} hitSlop={8}>
              <Text style={styles.headerAction}>Завершити</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            inverted
            keyExtractor={m => m.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.empty}>Немає повідомлень</Text>
            }
            renderItem={({ item }) => <MessageBubble msg={item} />}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Написати відповідь..."
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
            editable={!sending}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              (!draft.trim() || sending) && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isManager = msg.sender_type === 'manager';
  const time = new Date(msg.created_at).toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <View style={[styles.bubbleRow, isManager ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View style={[styles.bubble, isManager ? styles.bubbleManager : styles.bubbleCustomer]}>
        {msg.content_type === 'image' && msg.media_url && (
          <Image source={{ uri: msg.media_url }} style={styles.image} contentFit="cover" />
        )}
        {!!msg.text && (
          <Text style={[styles.bubbleText, isManager && styles.bubbleTextManager]}>
            {msg.text}
          </Text>
        )}
        <Text style={[styles.time, isManager && styles.timeManager]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: spacing.xxl },

  headerAction: { color: colors.danger, fontSize: 15, fontWeight: '600', marginRight: spacing.md },

  listContent: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },

  bubbleRow: { flexDirection: 'row', marginBottom: spacing.xs },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleManager: {
    backgroundColor: colors.brand,
    borderBottomRightRadius: radius.sm,
  },
  bubbleCustomer: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextManager: { color: colors.card },
  image: { width: 220, height: 220, borderRadius: radius.md, marginBottom: spacing.xs },
  time: { fontSize: 10, color: colors.textFaint, marginTop: 2, alignSelf: 'flex-end' },
  timeManager: { color: 'rgba(255,255,255,0.7)' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: 15,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnPressed: { opacity: 0.7 },
  sendBtnText: { color: colors.card, fontSize: 22, fontWeight: '700', lineHeight: 24 },
});
