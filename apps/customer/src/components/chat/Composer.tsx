// The web workspace composer: "+" (attach), emoji, a rounded "Type a message"
// field and a round accent send button. Voice notes need an audio package the
// app doesn't ship, so the right button stays a (disabled) send arrow.
import { Camera, Image as ImageIcon, Plus, Send, Smile } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cw } from '@/components/chatUi';
import { EmojiPanel } from '@/components/chat/EmojiPanel';
import { useT } from '@/lib/i18n';
import { accent } from '@/lib/theme';

export function Composer({ placeholder, onSendText, onAttach, onFocus }: {
  placeholder?: string;
  onSendText: (body: string) => void;
  /** Omit to hide the "+" button. */
  onAttach?: (source: 'library' | 'camera') => void;
  onFocus?: () => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [menu, setMenu] = useState(false);
  const [barH, setBarH] = useState(56);
  const sel = useRef({ start: 0, end: 0 });
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    sel.current = { start: 0, end: 0 };
    onSendText(body);
  };

  const insertEmoji = (e: string) => {
    const { start, end } = sel.current;
    const a = Math.min(start, text.length), b = Math.min(end, text.length);
    setText(text.slice(0, a) + e + text.slice(b));
    sel.current = { start: a + e.length, end: a + e.length };
  };

  const toggleEmoji = () => {
    if (emoji) { setEmoji(false); input.current?.focus(); return; }
    Keyboard.dismiss();
    setEmoji(true);
  };

  const has = !!text.trim();
  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { paddingBottom: emoji ? 8 : Math.max(insets.bottom, 8) }]} onLayout={e => setBarH(e.nativeEvent.layout.height)}>
        {onAttach ? (
          <Pressable onPress={() => { Keyboard.dismiss(); setMenu(true); }} style={styles.icon} accessibilityLabel={t('Attach a photo or file')}>
            <Plus size={22} color={cw.sub} strokeWidth={2} />
          </Pressable>
        ) : null}
        <Pressable onPress={toggleEmoji} style={[styles.icon, emoji && { backgroundColor: cw.chip }]} accessibilityLabel={t('Emoji')}>
          <Smile size={22} color={cw.sub} strokeWidth={2} />
        </Pressable>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          onSelectionChange={e => { sel.current = e.nativeEvent.selection; }}
          onFocus={() => { setEmoji(false); onFocus?.(); }}
          placeholder={placeholder ?? t('Type a message')}
          placeholderTextColor={cw.muted}
          multiline
          style={styles.input}
        />
        <Pressable onPress={send} disabled={!has} style={[styles.send, { opacity: has ? 1 : 0.4 }]} accessibilityLabel={t('Send')}>
          <Send size={18} color="#fff" strokeWidth={2.2} style={{ marginLeft: -2 }} />
        </Pressable>
      </View>
      {emoji ? <View style={{ paddingBottom: insets.bottom, backgroundColor: '#fff' }}><EmojiPanel onPick={insertEmoji} /></View> : null}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)}>
          <View style={[styles.pop, { bottom: barH + (emoji ? 280 + insets.bottom : 0) + 6 }]}>
            {([['library', ImageIcon, 'Photo library'], ['camera', Camera, 'Take photo']] as const).map(([src, Icon, label]) => (
              <Pressable key={src} onPress={() => { setMenu(false); onAttach?.(src); }} style={({ pressed }) => [styles.popItem, pressed && { backgroundColor: cw.field }]}>
                <Icon size={19} color={accent} strokeWidth={2} />
                <Text style={styles.popText}>{t(label)}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: cw.line },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingHorizontal: 8, paddingTop: 8 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, minWidth: 0, borderRadius: 20, backgroundColor: cw.field, color: cw.text,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 14.5, lineHeight: 19.6, minHeight: 40, maxHeight: 96,
  },
  send: { width: 40, height: 40, borderRadius: 20, marginLeft: 4, marginBottom: 1, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' },
  pop: {
    position: 'absolute', left: 8, minWidth: 200, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: cw.line,
    paddingVertical: 4, boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
  },
  popItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  popText: { fontSize: 14.5, color: cw.text },
});
