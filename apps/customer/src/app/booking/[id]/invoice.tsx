// The finalized bill for a booking — or, with `?number=IV…`, any invoice /
// cash bill the customer owns (credits reloads, membership bills, "Points
// earned from IV…" rows). Laid out like the web's Classic invoice (logo left,
// title right, company lines, Bill To + No./Date/status, dark-header item
// table, totals, points lines, notes) and shareable as the same A4 PDF.
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Notice, PrimaryButton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getInvoice } from '@/lib/extras';
import { useT } from '@/lib/i18n';
import {
  buildInvoiceView, companyLines, getInvoiceByNumber, initials, invoiceHtml, pointsRows, PX, STATUS_CLR, totalsRows,
  type DocView, type InvoiceData,
} from '@/lib/invoice';
import { useBookings } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { accent, useColors } from '@/lib/theme';

/** The 560 px web sheet, enlarged so its 8 px body text reads at ~12 on a phone. */
const S = 1.45;
const U = (mm: number) => PX(mm) * S;

export default function Invoice() {
  const c = useColors();
  const { t } = useT();
  const { id, number } = useLocalSearchParams<{ id: string; number?: string }>();
  const { session } = useSession();
  const bookings = useBookings().data;
  const byNumber = !!number;
  const q = useQuery({
    queryKey: byNumber ? ['invoice-number', number] : ['invoice', id],
    queryFn: () => (byNumber ? getInvoiceByNumber(session!.token, number!) : getInvoice(session!.token, id)) as Promise<InvoiceData>,
    retry: false,
  });
  const v = useMemo(() => {
    if (!q.data) return null;
    return buildInvoiceView(q.data, byNumber
      ? { number: number! }
      : { bookingId: id, bookingDateOf: bid => bookings?.find(b => b.id === bid)?.booking_date ?? null });
  }, [q.data, byNumber, number, id, bookings]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (q.isPending) return <ActivityIndicator style={{ marginTop: 40 }} color={accent} />;
  if (q.isError || !v) {
    const none = q.error instanceof ApiError && q.error.code === 'no_invoice';
    return (
      <View style={{ padding: 20, backgroundColor: c.bg, flex: 1 }}>
        <Notice tone={none ? 'warn' : 'error'}>
          {none ? (byNumber ? t('Invoice not available — please try again later.') : 'There’s no invoice for this booking yet.') : (q.error as Error).message}
        </Notice>
      </View>
    );
  }
  const title = `${v.label === 'CASH BILL' ? 'Cash bill' : 'Invoice'} ${v.number}`;

  const share = async () => {
    setBusy(true); setErr(null);
    try {
      const { uri } = await Print.printToFileAsync({ html: invoiceHtml(v), width: 595, height: 842 });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: '#f3f4f6' }} contentContainerStyle={{ padding: 12, gap: 14, paddingBottom: 32 }}>
      <Stack.Screen options={{ title }} />
      <Sheet v={v} />
      {err && <Notice tone="error">{err}</Notice>}
      <PrimaryButton label={t('Download invoice')} busy={busy} onPress={share} />
    </ScrollView>
  );
}

/** Native copy of the Classic template (same structure, colours, proportions). */
function Sheet({ v }: { v: DocView }) {
  const cfg = v.cfg, hd = cfg.headerColor;
  const m = 14;
  const logoH = U(13) * (cfg.logoSize / 100);
  const lines = companyLines(v.company, cfg);
  const sClr = v.payStatus ? (STATUS_CLR[v.payStatus] ?? '#ca8a04') : '';
  const pts = pointsRows(v);
  const cols = [{ w: 0, h: 'Description' }, { w: U(8), h: 'Qty' }, { w: U(19), h: 'Unit Price' }, { w: U(20), h: 'Amount' }];

  return (
    <View style={styles.sheet}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 22, paddingHorizontal: m, gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {cfg.showLogo && (v.company.logoUrl
            ? <Image source={{ uri: v.company.logoUrl }} style={{ height: logoH, width: U(70), alignSelf: 'flex-start' }} contentFit="contain" contentPosition="left" />
            : (
              <View style={{ width: logoH, height: logoH, borderRadius: 4, backgroundColor: hd, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: U(5.5) }}>{initials(v.company.name)}</Text>
              </View>
            ))}
          {cfg.showCompany && (
            <View style={{ marginTop: cfg.showLogo ? U(3) : 0 }}>
              {!!v.company.name && <Text style={{ fontWeight: '700', color: '#1a1a1a', fontSize: U(5.2), lineHeight: U(5.2) * 1.15, marginBottom: U(1.5) }}>{v.company.name}</Text>}
              {lines.map((l, i) => <Text key={i} style={{ fontSize: U(2.8), color: '#686868', lineHeight: U(4.2) }}>{l}</Text>)}
            </View>
          )}
        </View>
        <Text style={{ fontSize: U(9), fontWeight: '700', color: '#1a1a1a', lineHeight: U(9) * 1.05 }}>{v.label}</Text>
      </View>

      <View style={{ marginHorizontal: m, marginVertical: U(3), height: 1, backgroundColor: '#ddd' }} />

      <View style={{ marginHorizontal: m, marginBottom: U(4), backgroundColor: '#f5f5f5', flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingVertical: U(2), paddingHorizontal: U(3) }}>
          <Text style={{ fontSize: U(3.2), fontWeight: '700', color: '#64748b', marginBottom: U(1), letterSpacing: 1 }}>{v.partyLabel.toUpperCase()}</Text>
          <Text style={{ fontSize: U(3.8), fontWeight: '700', color: '#1a1a1a' }}>{v.partyName}</Text>
          {!!v.partyPhone && <Text style={[styles.party, { marginTop: U(0.5) }]}>{v.partyPhone}</Text>}
          {!!v.partyEmail && <Text style={styles.party}>{v.partyEmail}</Text>}
          {!!v.partyAddress && <Text style={styles.party}>{v.partyAddress}</Text>}
        </View>
        <View style={{ paddingVertical: U(2), paddingHorizontal: U(3), alignItems: 'flex-end', maxWidth: '50%' }}>
          <Meta l="No" r={v.number} />
          {!!v.bookingId && <Meta l="Booking ID" r={v.bookingId} />}
          <Meta l="Date" r={v.date} />
          {!!v.dueDate && <Meta l="Due" r={v.dueDate} />}
          {!!v.payStatus && (
            <View style={{ marginTop: U(1), paddingVertical: U(0.6), paddingHorizontal: U(2), borderRadius: U(2), backgroundColor: `${sClr}22` }}>
              <Text style={{ color: sClr, fontSize: U(2.5), fontWeight: '700', letterSpacing: 1 }}>{v.payStatus.toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={{ marginHorizontal: m }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: hd }}>
          {cols.map(col => (
            <Text key={col.h} style={[styles.cell, col.w ? { width: col.w, textAlign: 'right' } : { flex: 1 }, { fontSize: U(3), fontWeight: '700', color: '#fff' }]}>{col.h}</Text>
          ))}
        </View>
        {v.rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: i % 2 ? '#f8f9fa' : '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
            {[r.desc, r.qty, r.rate, r.amt].map((txt, k) => (
              <Text key={k} style={[styles.cell, cols[k].w ? { width: cols[k].w, textAlign: 'right' } : { flex: 1 }, { fontSize: U(3.1), color: '#282828' }]}>{txt}</Text>
            ))}
          </View>
        ))}
      </View>

      <View style={{ marginTop: U(5), marginHorizontal: m }}>
        {totalsRows(v).map(([l, r]) => <SumRow key={l} l={l} r={r} style={{ fontSize: U(3.1), color: '#606060' }} wrap={{ marginBottom: U(1.5) }} />)}
        <SumRow l="Total" r={v.total} style={{ fontSize: U(3.8), fontWeight: '700', color: '#fff' }} wrap={{ backgroundColor: hd, paddingVertical: U(2) }} />
        {!!v.paid && <SumRow l="Paid:" r={v.paid} style={{ fontSize: U(3.1), color: '#16a34a', fontWeight: '700' }} wrap={{ marginTop: U(1.5) }} />}
        {!!v.balance && <SumRow l="Balance Due:" r={v.balance} style={{ fontSize: U(3.1), color: '#dc2626', fontWeight: '700' }} wrap={{ marginTop: U(1) }} />}
      </View>

      {pts.length > 0 && (
        <View style={{ marginTop: U(1.5), marginHorizontal: m, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <View style={{ width: U(80), backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', paddingVertical: U(0.8) }}>
            {pts.map(([l, r]) => (
              <View key={l} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: U(0.8) }}>
                <Text style={[styles.pts, { flex: 1, textAlign: 'right', paddingRight: U(3) }]}>{l}</Text>
                <Text style={[styles.pts, { width: amtW, textAlign: 'right', paddingRight: U(1.5) }]}>{r}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!!v.notes && (
        <View style={{ marginTop: U(3), marginHorizontal: m }}>
          <Text style={{ fontSize: U(3.2), fontWeight: '700', color: '#333', marginBottom: U(1) }}>Notes</Text>
          <Text style={{ fontSize: U(2.8), color: '#888', lineHeight: U(2.8) * 1.6 }}>{v.notes}</Text>
        </View>
      )}
      {cfg.showPaymentInfo && !!cfg.bankInfo && (
        <View style={{ marginTop: U(3), marginHorizontal: m }}>
          <Text style={{ fontSize: U(3.2), fontWeight: '700', color: '#333', marginBottom: U(1) }}>Payment Information</Text>
          <Text style={{ fontSize: U(2.8), color: '#888', lineHeight: U(2.8) * 1.7 }}>{cfg.bankInfo}</Text>
        </View>
      )}
    </View>
  );
}

const amtW = U(32);

function SumRow({ l, r, style, wrap }: { l: string; r: string; style: object; wrap?: object }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
      <View style={[{ width: U(80), flexDirection: 'row', alignItems: 'center' }, wrap]}>
        <Text style={[{ flex: 1, textAlign: 'right', paddingRight: U(3) }, style]}>{l}</Text>
        <Text style={[{ width: amtW, textAlign: 'right', paddingRight: U(1.5) }, style]}>{r}</Text>
      </View>
    </View>
  );
}

function Meta({ l, r }: { l: string; r: string }) {
  return (
    <Text style={{ fontSize: U(3), lineHeight: U(3) * 1.8, textAlign: 'right' }}>
      <Text style={{ fontWeight: '700', color: '#64748b' }}>{l}: </Text>
      <Text style={{ color: '#1a1a1a' }}>{r}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff', paddingBottom: 28, borderRadius: 4,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  party: { fontSize: U(3), color: '#606060' },
  cell: { paddingVertical: U(1.8), paddingHorizontal: U(1.5) },
  pts: { fontSize: U(3.1), fontWeight: '700', color: '#92400e' },
});
