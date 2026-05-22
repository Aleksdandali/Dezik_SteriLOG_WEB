import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { uploadPhoto } from '@/lib/ops';
import { STORAGE } from '@/lib/config';
import { colors, radius, spacing, text } from '@/lib/theme';

type FopDoc = {
  name: string;
  url: string;
  type: 'pdf' | 'image';
  uploaded_at: string;
};

const STORAGE_KEY = STORAGE.FOP_DOCS;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function detectType(uri: string): 'pdf' | 'image' {
  return /\.pdf(\?|$)/i.test(uri) ? 'pdf' : 'image';
}

export default function FopDocsScreen() {
  const [docs, setDocs] = useState<FopDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<FopDoc | null>(null);
  const [renaming, setRenaming] = useState<FopDoc | null>(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then(s => {
        if (!s) return;
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) setDocs(parsed as FopDoc[]);
        } catch {
          // Corrupt entry — drop it so the user can re-upload cleanly.
          SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveDocs = useCallback(async (next: FopDoc[]) => {
    setDocs(next);
    try { await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const pickAndUpload = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Доступ', 'Дозвольте доступ у налаштуваннях, щоб додати фото.');
      return;
    }
    const res = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ['images'], allowsEditing: false });
    if (res.canceled || !res.assets[0]) return;

    setUploading(true);
    try {
      const asset = res.assets[0];
      const url = await uploadPhoto(asset.uri, 'fop-documents');
      const name = asset.fileName?.replace(/\.[^.]+$/, '') ?? `Документ ${docs.length + 1}`;
      const doc: FopDoc = {
        name,
        url,
        type: detectType(url),
        uploaded_at: new Date().toISOString(),
      };
      await saveDocs([doc, ...docs]);
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось завантажити');
    } finally {
      setUploading(false);
    }
  };

  const promptUpload = () => {
    Alert.alert('Додати документ', undefined, [
      { text: '📷 Зробити фото', onPress: () => pickAndUpload('camera') },
      { text: '🖼 Обрати з галереї', onPress: () => pickAndUpload('library') },
      { text: 'Скасувати', style: 'cancel' },
    ]);
  };

  const shareDoc = async (doc: FopDoc) => {
    try {
      await Share.share({
        url: doc.url,
        message: `📄 ${doc.name}\n${doc.url}`,
        title: doc.name,
      });
    } catch {}
  };

  const deleteDoc = (doc: FopDoc) => {
    Alert.alert('Видалити документ?', doc.name, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => saveDocs(docs.filter(d => d.url !== doc.url)),
      },
    ]);
  };

  const openExternal = (doc: FopDoc) => {
    Linking.openURL(doc.url).catch(() => Alert.alert('Помилка', 'Не вдалось відкрити'));
  };

  const startRename = (doc: FopDoc) => {
    setRenameText(doc.name);
    setRenaming(doc);
  };

  const confirmRename = () => {
    if (!renaming) return;
    const trimmed = renameText.trim();
    if (!trimmed) { setRenaming(null); return; }
    saveDocs(docs.map(d => d.url === renaming.url ? { ...d, name: trimmed } : d));
    setRenaming(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Документи ФОП', headerTintColor: colors.brand }} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          onPress={promptUpload}
          disabled={uploading}
          style={({ pressed }) => [styles.uploadBox, pressed && styles.uploadPressed, uploading && styles.uploadDisabled]}
        >
          {uploading ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <>
              <Text style={styles.uploadIcon}>＋</Text>
              <Text style={styles.uploadText}>Завантажити документ</Text>
            </>
          )}
        </Pressable>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : docs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📄</Text>
            <Text style={styles.emptyTitle}>Немає документів</Text>
            <Text style={styles.emptyHint}>Завантажте фото документів — вони збережуться локально на цьому пристрої</Text>
          </View>
        ) : (
          docs.map(doc => (
            <View key={doc.url} style={styles.docCard}>
              <Pressable
                onPress={() => doc.type === 'image' ? setViewing(doc) : openExternal(doc)}
                onLongPress={() => startRename(doc)}
                style={({ pressed }) => [styles.docRow, pressed && styles.docPressed]}
              >
                <View style={[styles.docIcon, doc.type === 'pdf' ? styles.docIconPdf : styles.docIconImage]}>
                  <Text style={styles.docIconText}>{doc.type === 'pdf' ? '📕' : '🖼'}</Text>
                </View>
                <View style={styles.docBody}>
                  <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                  <Text style={styles.docMeta}>{fmtDate(doc.uploaded_at)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              <View style={styles.docActions}>
                <Pressable onPress={() => shareDoc(doc)} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
                  <Text style={styles.actionShare}>↗ Поділитися</Text>
                </Pressable>
                <View style={styles.actionDivider} />
                <Pressable onPress={() => deleteDoc(doc)} style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
                  <Text style={styles.actionDelete}>🗑 Видалити</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!viewing} transparent onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.lightbox} onPress={() => setViewing(null)}>
          {viewing && (
            <>
              <Image source={{ uri: viewing.url }} style={styles.lightboxImage} contentFit="contain" />
              <View style={styles.lightboxBar}>
                <Pressable onPress={() => shareDoc(viewing)} style={styles.lightboxButton}>
                  <Text style={styles.lightboxButtonText}>↗ Поділитися</Text>
                </Pressable>
                <Pressable onPress={() => setViewing(null)} style={styles.lightboxButton}>
                  <Text style={styles.lightboxButtonText}>Закрити</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Modal>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.renameOverlay}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Перейменувати</Text>
            <TextInput
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Назва"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
            <View style={styles.renameButtons}>
              <Pressable onPress={() => setRenaming(null)} style={styles.renameButton}>
                <Text style={styles.renameCancel}>Скасувати</Text>
              </Pressable>
              <Pressable onPress={confirmRename} style={[styles.renameButton, styles.renameButtonOk]}>
                <Text style={styles.renameOk}>Зберегти</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  center: { paddingVertical: spacing.xxl * 2, alignItems: 'center' },

  uploadBox: {
    backgroundColor: colors.brandTint,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.brand,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 80,
  },
  uploadPressed: { opacity: 0.7 },
  uploadDisabled: { opacity: 0.5 },
  uploadIcon: { fontSize: 28, color: colors.brand, fontWeight: '600' },
  uploadText: { ...text.bodyStrong, color: colors.brand },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2, gap: spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...text.heading, color: colors.textMuted },
  emptyHint: { ...text.meta, textAlign: 'center', paddingHorizontal: spacing.xl },

  docCard: { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  docPressed: { opacity: 0.7 },
  docIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  docIconPdf: { backgroundColor: colors.dangerTint },
  docIconImage: { backgroundColor: colors.infoTint },
  docIconText: { fontSize: 20 },
  docBody: { flex: 1, gap: 2 },
  docName: { ...text.bodyStrong },
  docMeta: { ...text.faint },
  chevron: { fontSize: 22, color: colors.textFaint, fontWeight: '300' },

  docActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  action: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  actionPressed: { backgroundColor: colors.surface },
  actionDivider: { width: 1, backgroundColor: colors.divider },
  actionShare: { fontSize: 13, fontWeight: '600', color: colors.brand },
  actionDelete: { fontSize: 13, fontWeight: '600', color: colors.danger },

  lightbox: {
    flex: 1,
    backgroundColor: colors.lightboxBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 40 : 0,
  },
  lightboxImage: { width: '100%', height: '85%' },
  lightboxBar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  lightboxButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  lightboxButtonText: { color: colors.card, fontSize: 14, fontWeight: '600' },

  renameOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  renameCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 360,
  },
  renameTitle: { ...text.heading },
  renameInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  renameButtons: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  renameButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md },
  renameButtonOk: { backgroundColor: colors.brand },
  renameCancel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  renameOk: { color: colors.card, fontSize: 14, fontWeight: '700' },
});
