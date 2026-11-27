// The finalized bill for a booking, shown natively and shareable as a PDF.
// Simpler layout than the web's admin-identical PDF; same figures.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Notice, PrimaryButton } from '@/components/ui';
import { tenant } from '@/config/tenant';
import { ApiError } from '@/lib/api';
import { getInvoice, type InvoiceResponse } from '@/lib/extras';
import { fmtDate, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { accent, useColors } from '@/lib/theme';

const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (v == null ? '' : String(v));
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function view(r: InvoiceResponse) {
  const d = r.doc, s = r.settings;
  const items = [...r.items].sort((a, b) => num(a.sort_order) - num(b.sort_order)).map(i => ({
    description: str(i.description), qty: num(i.quantity), unit: num(i.unit_price), amount: num(i.amount),
  }));
  return {
    title: d.document_type === 'cash_bill' ? 'Cash bill' : 'Invoice',
    number: str(d.document_number),
    date: str(d.issue_date).slice(0, 10),
    customer: [str(d.customer_name), str(d.customer_phone), str(d.customer_address)].filter(Boolean),
    company: {
      name: str(s.company_name) || tenant.name,
      lines: [str(s.company_address), s.registration_number ? `Reg. ${str(s.registration_number)}` : '', str(s.contact_number), str(s.email)].filter(Boolean),
      logo: str(s.company_logo_url),
    },
    items,
    subtotal: num(d.subtotal),
    discount: num(d.discount_amount),
    taxRate: num(d.tax_rate),
    tax: num(d.tax_amount),
    points: num(d.points_redeemed),
    total: num(d.total_amount),
    paid: num(d.amount_paid),
  };
}

function html(v: ReturnType<typeof view>) {
  const row = (l: string, r: string, b = false) => `<tr${b ? ' class="b"' : ''}><td>${esc(l)}</td><td class="r">${esc(r)}</td></tr>`;
  return `<html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#111;padding:32px;font-size:13px}
    h1{font-size:22px;margin:0} .muted{color:#666} table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{padding:8px 4px;border-bottom:1px solid #eee;text-align:left} .r{text-align:right} .b td{font-weight:700}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px} img{max-height:64px;max-width:180px}
  </style></head><body>
  <div class="head"><div>${v.company.logo ? `<img src="${esc(v.company.logo)}"/><br/>` : ''}<b>${esc(v.company.name)}</b><br/>
  <span class="muted">${v.company.lines.map(esc).join('<br/>')}</span></div>
  <div class="r"><h1>${esc(v.title)}</h1>${esc(v.number)}<br/><span class="muted">${esc(fmtDate(v.date))}</span></div></div>
  <p><b>Bill to</b><br/>${v.customer.map(esc).join('<br/>')}</p>
  <table><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr>
  ${v.items.map(i => `<tr><td>${esc(i.description)}</td><td class="r">${i.qty}</td><td class="r">${money(i.unit)}</td><td class="r">${money(i.amount)}</td></tr>`).join('')}
  </table><table>
  ${row('Subtotal', money(v.subtotal))}
  ${v.discount > 0 ? row('Discount', `− ${money(v.discount)}`) : ''}
  ${v.tax > 0 ? row(`Tax (${v.taxRate}%)`, money(v.tax)) : ''}
  ${v.points > 0 ? row('Paid with points', `− ${money(v.points)}`) : ''}
  ${row('Total', money(v.total), true)}
  ${row('Amount paid', money(v.paid))}
  </table></body></html>`;
}

export default function Invoice() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => getInvoice(session!.token, id), retry: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (q.isPending) return <ActivityIndicator style={{ marginTop: 40 }} color={accent} />;
  if (q.isError) {
    const none = q.error instanceof ApiError && q.error.code === 'no_invoice';
    return (
      <View style={{ padding: 20, backgroundColor: c.bg, flex: 1 }}>
        <Notice tone={none ? 'warn' : 'error'}>{none ? 'There’s no invoice for this booking yet.' : (q.error as Error).message}</Notice>
      </View>
    );
  }
  const v = view(q.data);

  const share = async () => {
    setBusy(true); setErr(null);
    try {
      const { uri } = await Print.printToFileAsync({ html: html(v) });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${v.title} ${v.number}`, UTI: 'com.adobe.pdf' });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Stack.Screen options={{ title: `${v.title} ${v.number}` }} />
      <View style={[styles.card, { backgroundColor: c.field }]}>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{v.company.name}</Text>
        {v.company.lines.map((l, i) => <Text key={i} style={{ color: c.muted }}>{l}</Text>)}
      </View>
      <View style={[styles.card, { backgroundColor: c.field }]}>
        <Line l={v.title} r={v.number} b />
        <Line l="Date" r={fmtDate(v.date)} />
        <Text style={{ color: c.muted, marginTop: 6 }}>Bill to</Text>
        {v.customer.map((l, i) => <Text key={i} style={{ color: c.text }}>{l}</Text>)}
      </View>
      <View style={[styles.card, { backgroundColor: c.field }]}>
        {v.items.map((i, k) => <Line key={k} l={`${i.description}${i.qty !== 1 ? ` × ${i.qty}` : ''}`} r={money(i.amount)} />)}
        <View style={[styles.rule, { backgroundColor: c.border }]} />
        <Line l="Subtotal" r={money(v.subtotal)} />
        {v.discount > 0 && <Line l="Discount" r={`− ${money(v.discount)}`} />}
        {v.tax > 0 && <Line l={`Tax (${v.taxRate}%)`} r={money(v.tax)} />}
        {v.points > 0 && <Line l="Paid with points" r={`− ${money(v.points)}`} />}
        <Line l="Total" r={money(v.total)} b />
        <Line l="Amount paid" r={money(v.paid)} />
      </View>
      {err && <Notice tone="error">{err}</Notice>}
      <PrimaryButton label="Save or share PDF" busy={busy} onPress={share} />
    </ScrollView>
  );
}

function Line({ l, r, b }: { l: string; r: string; b?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.line}>
      <Text style={{ color: c.text, fontWeight: b ? '700' : '400', flexShrink: 1 }}>{l}</Text>
      <Text style={{ color: c.text, fontWeight: b ? '700' : '400' }}>{r}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
});
