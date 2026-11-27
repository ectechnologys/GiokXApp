// Address box with Google suggestions (web: Places Autocomplete on the
// address input, Malaysia only). Typing edits the text as usual; picking a
// suggestion fills address, postcode, city and the pin.
import { MapPin } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { autocomplete, GMAPS_KEY, newSessionToken, placeDetails, type PickedPlace, type PlaceSuggestion } from '@/lib/places';
import { bf, gray } from '@/lib/theme';

export function AddressSearchField({ label, required, value, onChangeText, onPick, inputStyle, labelStyle }: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  onPick: (p: PickedPlace) => void;
  inputStyle?: object;
  labelStyle?: object;
}) {
  const { t } = useT();
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(false);
  const [list, setList] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const session = useRef(newSessionToken());

  // Suggestions follow what the customer types (not text set by a pick).
  useEffect(() => {
    if (!typed || !GMAPS_KEY) return;
    const q = value.trim();
    const h = setTimeout(async () => {
      if (q.length < 3) { setList([]); return; }
      try { setList(await autocomplete(q, session.current)); } catch { setList([]); }
    }, 300);
    return () => clearTimeout(h);
  }, [value, typed]);

  const pick = async (s: PlaceSuggestion) => {
    setBusy(true);
    try {
      const p = await placeDetails(s.placeId, session.current);
      if (p) onPick(p);
    } finally {
      session.current = newSessionToken();
      setList([]); setTyped(false); setBusy(false);
    }
  };

  const shown = focused && typed && list.length > 0;
  return (
    <View style={{ gap: 5 }}>
      <Text style={[styles.label, labelStyle]}>{label}{required ? <Text style={styles.req}>  *</Text> : null}</Text>
      <View style={[styles.inputWrap, inputStyle]}>
        <MapPin size={16} color={bf.muted2} />
        <TextInput value={value} placeholder={GMAPS_KEY ? t('Start typing an address…') : t('Street address')} placeholderTextColor={bf.muted2}
          onChangeText={v => { setTyped(true); onChangeText(v); }}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
          selection={focused ? undefined : { start: 0 }}
          style={styles.input} />
        {busy && <ActivityIndicator size="small" color={bf.muted} />}
      </View>
      {shown && (
        <View style={styles.list}>
          {list.slice(0, 5).map((s, i) => (
            <Pressable key={s.placeId} onPress={() => pick(s)} style={({ pressed }) => [styles.item, i > 0 && styles.itemLine, pressed && { backgroundColor: gray[50] }]}>
              <MapPin size={14} color={gray[400]} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.main}>{s.main}</Text>
                {s.secondary ? <Text style={styles.secondary}>{s.secondary}</Text> : null}
              </View>
            </Pressable>
          ))}
          <Text style={styles.powered}>powered by Google</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: '600', color: bf.ink2 },
  req: { color: '#b6893f', fontWeight: '700' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 8, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 9, fontSize: 13, color: bf.ink },
  list: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: gray[200], borderRadius: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  item: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  itemLine: { borderTopWidth: 1, borderTopColor: gray[100] },
  main: { fontSize: 13, fontWeight: '600', color: gray[900] },
  secondary: { fontSize: 11.5, color: gray[500], marginTop: 1 },
  powered: { fontSize: 10, color: gray[400], textAlign: 'right', paddingHorizontal: 10, paddingVertical: 4 },
});
