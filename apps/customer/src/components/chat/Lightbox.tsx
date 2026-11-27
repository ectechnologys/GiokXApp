// A photo full screen (web ChatPanel lightbox): black backdrop, close at the
// top right, swipe between the photos of an album with "2 / 4" below.
// Give it a new key for each photo opened (it starts at `index`).
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shownPhoto } from '@/components/chat/preview';
import { useT } from '@/lib/i18n';

export function Lightbox({ urls, index, onClose }: { urls: string[] | null; index: number; onClose: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [at, setAt] = useState(index);
  const open = !!urls?.length;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.back}>
        {open ? (
          <FlatList
            key={`${index}:${urls!.join('|')}`}
            data={urls}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(u, i) => `${i}-${u}`}
            onMomentumScrollEnd={e => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Pressable onPress={onClose} style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <Image source={{ uri: shownPhoto(item) }} style={{ width: width - 32, height: height - 32 - insets.top - insets.bottom }} contentFit="contain" />
              </Pressable>
            )}
          />
        ) : null}
        <Pressable onPress={onClose} style={[styles.close, { top: Math.max(16, insets.top + 8) }]} accessibilityLabel={t('Close')} hitSlop={8}>
          <X size={20} color="#fff" strokeWidth={2.5} />
        </Pressable>
        {urls && urls.length > 1 ? (
          <Text style={[styles.count, { bottom: Math.max(16, insets.bottom + 8) }]}>{at + 1} / {urls.length}</Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' },
  close: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', alignSelf: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
});
