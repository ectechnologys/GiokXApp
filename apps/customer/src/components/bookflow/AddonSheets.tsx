// Web AddonsPalette (search + tick list) and AddonSkipConfirm ("One-time
// check"), shown as the web's phone bottom sheet.
import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AddonRow } from '@/lib/booking';
import { useT } from '@/lib/i18n';
import { accent, bf } from '@/lib/theme';

import { line2, mono, Sheet, SheetFoot, Tick } from './atoms';

/** Add-on with the price it would cost given the current picks (web memberAddons). */
export type PricedAddon = AddonRow & { shownPrice: number };

function Rows({ addons, selected, onToggle }: { addons: PricedAddon[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <>
      {addons.map(a => {
        const on = selected.includes(a.id);
        return (
          <Pressable key={a.id} onPress={() => onToggle(a.id)} style={({ pressed }) => [st.row, pressed && { backgroundColor: bf.hover }]}>
            <Tick on={on} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name}>{a.name}</Text>
              {a.description ? <Text style={st.desc}>{a.description}</Text> : null}
            </View>
            <Text style={st.price}>RM {a.shownPrice}</Text>
          </Pressable>
        );
      })}
    </>
  );
}

const totalOf = (addons: PricedAddon[], selected: string[]) =>
  addons.filter(a => selected.includes(a.id)).reduce((s, a) => s + Number(a.shownPrice || 0), 0);

export function AddonsPalette({ open, onClose, addons, selected, onToggle }: {
  open: boolean; onClose: () => void; addons: PricedAddon[]; selected: string[]; onToggle: (id: string) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const close = () => { setQuery(''); onClose(); };
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return addons;
    return addons.filter(a => a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q));
  }, [addons, query]);
  return (
    <Sheet open={open} onClose={close}>
      <View style={st.search}>
        <Search size={16} color={bf.muted} strokeWidth={2} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t('Search extras…')} placeholderTextColor={bf.muted2} style={st.searchInput} />
        <Pressable onPress={close} hitSlop={8} style={st.kbd}><Text style={st.kbdText}>ESC</Text></Pressable>
      </View>
      <ScrollView style={st.list} contentContainerStyle={{ padding: 8 }} keyboardShouldPersistTaps="handled">
        {filtered.length === 0
          ? <Text style={st.empty}>{t('No extras match "{q}"', { q: query })}</Text>
          : <Rows addons={filtered} selected={selected} onToggle={onToggle} />}
      </ScrollView>
      <SheetFoot count={selected.length} total={totalOf(addons, selected)} button={t('Done')} onPress={close} />
    </Sheet>
  );
}

export function AddonSkipConfirm({ open, onClose, onConfirm, addons, selected, onToggle, tenantName }: {
  open: boolean; onClose: () => void; onConfirm: () => void; addons: PricedAddon[]; selected: string[];
  onToggle: (id: string) => void; tenantName: string;
}) {
  const { t } = useT();
  const n = selected.length;
  return (
    <Sheet open={open} onClose={onClose}>
      <View style={st.head}>
        <Text style={st.headK}>{t('One-time check')}</Text>
        <Text style={st.headT}>{t("Sure you don't want any extras?")}</Text>
        <Text style={st.headP}>{t('These add-ons let {name} do more in the time you booked. Tick what you need, or skip.', { name: tenantName })}</Text>
      </View>
      <ScrollView style={st.list} contentContainerStyle={{ padding: 8 }}>
        <Rows addons={addons} selected={selected} onToggle={onToggle} />
      </ScrollView>
      <SheetFoot count={n} total={totalOf(addons, selected)} onPress={onConfirm}
        button={n > 0 ? (n === 1 ? t('Add & continue') : t('Add {n} & continue', { n })) : t('No thanks, continue')} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: line2 },
  searchInput: { flex: 1, paddingVertical: 4, fontSize: 15, color: bf.ink },
  kbd: { paddingVertical: 2, paddingHorizontal: 6, backgroundColor: bf.hover, borderWidth: 1, borderColor: bf.line, borderRadius: 4 },
  kbdText: { fontFamily: mono, fontSize: 10.5, color: bf.muted },
  list: { flexGrow: 0, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  name: { fontSize: 13.5, fontWeight: '500', color: bf.ink },
  desc: { fontSize: 11.5, color: bf.muted, marginTop: 2, lineHeight: 16 },
  price: { fontSize: 12.5, fontWeight: '600', color: bf.ink2 },
  empty: { paddingVertical: 32, paddingHorizontal: 20, textAlign: 'center', color: bf.muted, fontSize: 13 },
  head: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: line2 },
  headK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 2.3, textTransform: 'uppercase', color: accent, marginBottom: 4 },
  headT: { fontSize: 15, fontWeight: '600', letterSpacing: -0.15, color: bf.ink, marginBottom: 4 },
  headP: { fontSize: 12.5, color: bf.ink3, lineHeight: 19 },
});
