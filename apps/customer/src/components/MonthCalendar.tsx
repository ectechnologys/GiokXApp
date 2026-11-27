// The web booking flow's month calendar (bf-cal): S M T W T F S grid, past /
// out-of-window days grey, full days struck through, today ringed in the
// accent, the pick filled ink, a red dot on public holidays.
import { useQueries } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getSlots, type ServerSlot } from '@/lib/booking';
import { fmtMonth, useT } from '@/lib/i18n';
import { accent, bf } from '@/lib/theme';

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function MonthCalendar({ value, onPick, minDate, maxDate, today, holidays, allowHoliday, token, slotMatches, disabled }: {
  value: string | null;
  onPick: (d: string) => void;
  /** First bookable day (today or the company's "booking from"). */
  minDate: string;
  maxDate: string;
  today: string;
  holidays: Map<string, string>;
  allowHoliday: boolean;
  token?: string;
  /** Which of a day's slots count (all of them before a service is picked). */
  slotMatches: (s: ServerSlot) => boolean;
  disabled?: boolean;
}) {
  const { lang } = useT();
  const start = value ?? (minDate > today ? minDate : today);
  const [cursor, setCursor] = useState(() => { const d = new Date(`${start}T00:00:00`); return { y: d.getFullYear(), m: d.getMonth() }; });

  const days = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const n = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let i = 1; i <= n; i++) out.push(new Date(cursor.y, cursor.m, i));
    return out;
  }, [cursor]);

  // Availability for every open day of the shown month (web: monthAvailability).
  const openKeys = days.filter((d): d is Date => !!d).map(key).filter(k => k >= minDate && k >= today && k <= maxDate);
  const qs = useQueries({
    queries: openKeys.map(k => ({ queryKey: ['slots', k, token ? 'me' : 'anon'], queryFn: () => getSlots(k, token), staleTime: 60_000 })),
  });
  const unavailable = useMemo(() => {
    const s = new Set<string>();
    if (!qs.every(q => q.isFetched)) return s;
    const nowHour = new Date().getHours();
    qs.forEach((q, i) => {
      const k = openKeys[i];
      const m = (q.data?.slots ?? []).filter(slotMatches);
      if (!q.data || !m.length) return;
      const eff = m.map(x => (k === today && x.start_hour <= nowHour ? 'full' : x.status));
      if (eff.every(x => x !== 'available')) s.add(k);
    });
    return s;
  }, [qs, openKeys, slotMatches, today]);

  const move = (dm: number) => setCursor(c => { const d = new Date(c.y, c.m + dm, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const dow = lang === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Pressable onPress={() => move(-1)} style={styles.nav} hitSlop={6}><ChevronLeft size={16} color={bf.ink3} /></Pressable>
        <Text style={styles.month}>{fmtMonth(cursor.y, cursor.m)}</Text>
        <Pressable onPress={() => move(1)} style={styles.nav} hitSlop={6}><ChevronRight size={16} color={bf.ink3} /></Pressable>
      </View>
      <View style={[styles.grid, { marginBottom: 6 }]}>
        {dow.map((d, i) => <Text key={i} style={styles.dow}>{d}</Text>)}
      </View>
      <View style={styles.grid}>
        {days.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const k = key(d);
          const past = k < today;
          const beyond = !past && (k < minDate || k > maxDate);
          const hol = holidays.get(k);
          const holBlocked = !past && !beyond && !!hol && !allowHoliday;
          const unavail = !past && !beyond && !holBlocked && unavailable.has(k);
          const blocked = past || beyond || holBlocked || unavail || !!disabled;
          const on = value === k;
          return (
            <View key={i} style={styles.cell}>
              <Pressable disabled={blocked} onPress={() => onPick(k)}
                style={[styles.day, on && styles.dayOn, k === today && !on && styles.today]}>
                <Text style={[
                  styles.dayText,
                  (past || beyond || unavail) && { color: bf.muted2 },
                  holBlocked && { color: 'rgba(164,56,31,0.42)' },
                  unavail && { textDecorationLine: 'line-through' },
                  on && { color: '#fff', fontWeight: '600' },
                ]}>{d.getDate()}</Text>
                {hol ? <View style={[styles.holDot, on && { backgroundColor: '#fff' }]} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  nav: { width: 30, height: 30, borderWidth: 1, borderColor: bf.line, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  month: { fontSize: 13, fontWeight: '600', color: bf.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 9.5, fontWeight: '700', letterSpacing: 1.5, color: bf.muted2, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 1.5 },
  day: { flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  dayOn: { backgroundColor: bf.ink },
  today: { borderColor: accent },
  dayText: { fontSize: 13, fontWeight: '500', color: bf.ink, fontVariant: ['tabular-nums'] },
  holDot: { position: 'absolute', bottom: 4, width: 3, height: 3, borderRadius: 1.5, backgroundColor: bf.danger },
});
