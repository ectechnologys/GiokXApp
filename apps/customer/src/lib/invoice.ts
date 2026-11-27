// Customer invoice, assembled like the web /account download: the web's
// billingDocBuilder (buildLiveDocData + billKindOf + applyPointsLines) and the
// admin "Classic" LiveDocPreview template, as data + print HTML for expo-print.
import { callFunction } from '@/lib/api';
import type { InvoiceResponse } from '@/lib/extras';

/** customer-auth get-invoice also returns the customer's points context. */
export type InvoiceData = InvoiceResponse & {
  customer?: { c_coins?: number | null; is_member?: boolean | null; c_coins_start?: string | null; c_coins_expires?: string | null } | null;
};

/** Invoice / cash bill by its document number (reload, membership and
 *  "Points earned from IV…/CB…" rows). Code 'no_invoice' when not found. */
export const getInvoiceByNumber = (token: string, invoiceNumber: string) =>
  callFunction<InvoiceData>('customer-auth', { action: 'get-invoice', invoice_number: invoiceNumber }, token);

// ── Credits history markers (web PointsHistoryCard) ──────────────────────────

/** Hidden `[IVxxxx]` marker on reload rows. */
const bracketMarkerOf = (desc: string): string | null => (desc.match(/\[([A-Z][A-Z0-9]{4,})\]/) || [])[1] ?? null;

/** Any history row naming an invoice: the marker, or "Points earned from IV…/CB…". */
export const invoiceMarkerOf = (desc: string): string | null =>
  bracketMarkerOf(desc) ?? ((desc.match(/^Points earned from ([A-Z][A-Z0-9]{4,})\s*$/) || [])[1] ?? null);

// ── Document data (web buildLiveDocData / applyPointsLines) ──────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  MYR: 'RM', RM: 'RM', USD: '$', SGD: 'S$', EUR: '€', GBP: '£', IDR: 'Rp', THB: '฿', VND: '₫',
  AUD: 'A$', CAD: 'C$', JPY: '¥', KRW: '₩', PHP: '₱', CNY: '¥', HKD: 'HK$',
};

type Raw = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (v == null ? '' : String(v));

const BOOKING_NOTE_RE_G = /booking:\[([^\]]+)\]/gi;
const bookingUuids = (notes: string) => [...notes.matchAll(BOOKING_NOTE_RE_G)].map(m => m[1]);
const formatBookingId = (id: string) => `BK-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** date-fns 'dd MMM yyyy' → "27 Nov 2026". */
function ddMmmYyyy(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  const mon = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getMonth()];
  return `${String(d.getDate()).padStart(2, '0')} ${mon} ${d.getFullYear()}`;
}

/** "+60 129775922" (web displayPhone: split at the country code). */
function displayPhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d+]/g, '');
  const m = digits.match(/^\+(1|7|2\d|3\d|4\d|5\d|6\d|8\d|9\d)(\d{4,})$/);
  if (!m) return raw;
  // Two-digit codes except +1 / +7 (NANP, Russia), like libphonenumber for our markets.
  return `+${m[1]} ${m[2]}`;
}

export interface Company {
  name: string; address: string; phone: string; email: string; reg: string; logoUrl: string;
  website: string; tin: string; sst: string; facebook: string; instagram: string; tiktok: string;
}

export interface TemplateCfg {
  headerColor: string;
  showLogo: boolean;
  showCompany: boolean;
  showSocial: boolean;
  showTaxIds: boolean;
  logoSize: number;
  bankInfo: string;
  showPaymentInfo: boolean;
  template: string;
}

export interface DocView {
  label: string;
  number: string;
  bookingId?: string;
  date: string;
  dueDate?: string;
  payStatus?: string;
  partyLabel: string;
  partyName: string;
  partyPhone?: string;
  partyEmail?: string;
  partyAddress?: string;
  rows: { desc: string; qty: string; rate: string; amt: string }[];
  sub: string;
  taxLine?: string; tax?: string;
  roundLine?: string; round?: string;
  discountLine?: string; discount?: string;
  total: string;
  paid?: string;
  balance?: string;
  notes?: string;
  pointsName?: string;
  pointsEarned?: string;
  pointsReloaded?: string;
  pointsBalance?: string;
  company: Company;
  cfg: TemplateCfg;
}

function templateCfg(s: Raw): TemplateCfg {
  const stored = (s.pdf_template_config ?? null) as Raw | null;
  const c: Raw = stored?.template ? stored
    : stored?.baseTemplate ? { header_color: stored.primaryColor ?? '#2980b3' }
    : {};
  return {
    headerColor: str(c.header_color) || '#374151',
    showLogo: c.show_logo !== false,
    showCompany: c.show_company_details !== false,
    showSocial: c.show_social_details !== false,
    showTaxIds: c.show_tax_ids !== false,
    logoSize: num(c.logo_size) || 100,
    bankInfo: str(c.bank_account_info),
    showPaymentInfo: c.show_payment_info !== false,
    template: str(c.template) || str(s.pdf_template) || 'classic',
  };
}

const company = (s: Raw): Company => ({
  name: str(s.company_name), address: str(s.company_address), phone: str(s.contact_number), email: str(s.email),
  reg: str(s.registration_number), logoUrl: str(s.company_logo_url), website: str(s.website), tin: str(s.tin),
  sst: str(s.sst), facebook: str(s.facebook), instagram: str(s.instagram), tiktok: str(s.tiktok),
});

type Cust = InvoiceData['customer'];

/** web isMemberForBillGate */
function memberForGate(cust: Cust, gateDate: string | null): boolean {
  if (!gateDate) return false;
  const start = cust?.c_coins_start, expires = cust?.c_coins_expires;
  if (!start || !expires) return false;
  const bd = gateDate.slice(0, 10);
  if (bd < start.slice(0, 10) || bd > expires.slice(0, 10)) return false;
  return bd < new Date().toISOString().slice(0, 10) ? true : !!cust?.is_member;
}

/** web memberEarnBase — a combined invoice earns only on its member visits. */
function memberEarnBase(total: number, items: Raw[], allIds: string[], eligible: Set<string>): number {
  if (total <= 0) return 0;
  if (allIds.length <= 1) return eligible.size > 0 ? total : 0;
  const tagged = items.filter(i => i.appointment_id && allIds.includes(str(i.appointment_id)) && num(i.amount) > 0);
  if (!tagged.length) return Math.round(total * (eligible.size / allIds.length) * 100) / 100;
  const whole = tagged.reduce((a, i) => a + num(i.amount), 0);
  if (whole <= 0) return 0;
  const mine = tagged.filter(i => eligible.has(str(i.appointment_id))).reduce((a, i) => a + num(i.amount), 0);
  return Math.round(total * (mine / whole) * 100) / 100;
}

/**
 * Builds the invoice exactly like the web customer download.
 * `by` = how it was opened: a booking (its date drives the earn gate; other
 * linked bookings' dates come from `bookingDateOf`) or a document number
 * (reload / membership bill — the issue date drives it, signup never earns).
 */
export function buildInvoiceView(
  r: InvoiceData,
  by: { bookingId: string; bookingDateOf: (id: string) => string | null } | { number: string },
): DocView {
  const d = r.doc as Raw, s = (r.settings ?? {}) as Raw;
  const items = [...(r.items as Raw[])].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const currency = CURRENCY_SYMBOLS[str(s.currency) || 'RM'] ?? (str(s.currency) || 'RM');
  const fmt = (n: number) => `${currency}${Number(n).toFixed(2)}`;
  const isCashBill = d.document_type === 'cash_bill';
  const notes = str(d.notes);

  const taxRate = d.tax_rate != null ? num(d.tax_rate) : num(s.tax_rate);
  const subtotal = d.subtotal != null ? num(d.subtotal) : items.reduce((a, i) => a + num(i.amount), 0);
  const taxAmount = d.tax_amount != null ? num(d.tax_amount) : subtotal * (taxRate / 100);
  const total = num(d.total_amount) || subtotal + taxAmount;
  const roundAdj = Math.round((total - subtotal - taxAmount) * 100) / 100;
  const discountAmt = Math.max(0, num(d.discount_amount));
  const discountRate = Math.max(0, num(d.discount_rate));
  const ps = str(d.payment_status);
  const amtPaid = ps === 'paid' || ps === 'cash' ? total : ps === 'partial' ? num(d.paid_amount) : 0;
  const balance = total - amtPaid;

  const linesCarryBk = items.some(i => str(i.description).includes('BK-'));
  const linked = bookingUuids(notes);
  let bookingId = !linesCarryBk && linked.length === 1 ? formatBookingId(linked[0]) : '';
  if ('bookingId' in by && !linesCarryBk && !bookingId && linked.length <= 1) bookingId = formatBookingId(by.bookingId);

  const v: DocView = {
    label: isCashBill ? 'CASH BILL' : 'INVOICE',
    number: str(d.document_number),
    bookingId: bookingId || undefined,
    date: ddMmmYyyy(str(d.issue_date)),
    dueDate: d.due_date ? ddMmmYyyy(str(d.due_date)) : undefined,
    payStatus: ps || undefined,
    partyLabel: 'Bill To',
    partyName: str(d.payee_name) || str(d.customer_name),
    partyEmail: str(d.customer_email) || undefined,
    partyPhone: displayPhone(str(d.customer_phone)) || undefined,
    partyAddress: str(d.customer_address) || undefined,
    rows: items.map(i => ({ desc: str(i.description), qty: String(num(i.quantity)), rate: fmt(num(i.unit_price)), amt: fmt(num(i.amount)) })),
    sub: fmt(subtotal),
    taxLine: taxRate > 0 ? `${taxAmount > 0.001 && Math.abs(total - subtotal) < 0.01 ? 'Incl. ' : ''}${str(d.tax_name) || str(s.tax_name) || 'Tax'} (${taxRate}%)` : undefined,
    tax: taxRate > 0 ? fmt(taxAmount) : undefined,
    roundLine: roundAdj > 0.001 ? 'Round up' : undefined,
    round: roundAdj > 0.001 ? fmt(roundAdj) : undefined,
    discountLine: discountAmt > 0.001 ? (discountRate > 0 ? `Discount (${discountRate}%)` : 'Discount') : undefined,
    discount: discountAmt > 0.001 ? `-${fmt(discountAmt)}` : undefined,
    total: fmt(total),
    paid: amtPaid > 0 ? fmt(amtPaid) : undefined,
    balance: balance > 0.001 ? fmt(balance) : undefined,
    notes: notes.replace(BOOKING_NOTE_RE_G, '').trim() || undefined,
    company: company(s),
    cfg: templateCfg(s),
  };

  // ── Points lines (web applyPointsLines, invoice / cash bill) ──
  const cust = r.customer ?? null;
  let gateDate: string | null;
  let earnBaseOverride: number | null = null;
  let isReloadDoc = false;
  if ('number' in by) {
    const n = notes.trim();
    const membershipKind = /^membership (extension|renewal)/i.test(n) ? 'extend' : /^membership signup/i.test(n) ? 'signup' : null;
    isReloadDoc = membershipKind === null && (/\breload$/i.test(n) || items.some(i => /\breload\b/i.test(str(i.description))));
    gateDate = membershipKind === 'signup' ? null : (str(d.issue_date).slice(0, 10) || null);
  } else {
    gateDate = str(r.booking_date ?? by.bookingDateOf(by.bookingId)).slice(0, 10) || null;
    if (linked.length > 1) {
      const dateOf = (id: string) => by.bookingDateOf(id) ?? (id === by.bookingId ? gateDate : null);
      earnBaseOverride = memberEarnBase(total, items, linked, new Set(linked.filter(id => memberForGate(cust, dateOf(id)))));
    }
  }
  const pointsName = str(s.points_display_name) || 'C Coins';
  const earningPct = s.earning_percentage != null ? Number(s.earning_percentage) : 1;
  const earnBase = earnBaseOverride != null ? earnBaseOverride : (memberForGate(cust, gateDate) ? total : 0);
  const earned = earningPct > 0 && earnBase > 0 && ps !== 'redemption' ? earnBase * (earningPct / 100) : 0;
  const coins = num(cust?.c_coins);
  v.pointsName = pointsName;
  if (earned > 0) v.pointsEarned = earned.toFixed(2);
  v.pointsBalance = (ps === 'paid' || ps === 'cash' ? coins : coins + earned).toFixed(2);
  if (isReloadDoc) {
    const bonus = items.reduce((a, it) => {
      if (!/reload bonus/i.test(str(it.description))) return a;
      const m = str(it.description).match(/\+RM\s*([\d,]+(?:\.\d+)?)/i);
      return a + (m ? Number(m[1].replace(/,/g, '')) : 0);
    }, 0);
    const credited = total + bonus;
    if (credited > 0) v.pointsReloaded = credited.toFixed(2);
  }
  return v;
}

// ── Shared pieces of the Classic template ────────────────────────────────────

/** mm → px on the web's 560 px-wide A4 preview sheet. */
export const PX = (mm: number) => (mm / 210) * 560;

export const STATUS_CLR: Record<string, string> = {
  paid: '#16a34a', cash: '#16a34a', partial: '#ea580c', unpaid: '#ca8a04', refund: '#6b7280', package: '#7c3aed', redemption: '#7c3aed',
};

export function initials(name?: string): string {
  if (!name) return '?';
  const words = name.replace(/[^A-Za-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** web CompanyBlock text lines (label prefixes not doubled). */
export function companyLines(c: Company, cfg: TemplateCfg): string[] {
  const noPrefix = (val: string, prefix: string) => {
    const t = val.trim();
    return t.toLowerCase().startsWith(prefix.toLowerCase()) ? t.slice(prefix.length).trim() : t;
  };
  const socials = [c.facebook && `FB: ${c.facebook}`, c.instagram && `IG: ${c.instagram}`, c.tiktok && `TikTok: ${c.tiktok}`].filter(Boolean).join('  |  ');
  const out: string[] = [];
  const push = (t: string) => { if (t.trim()) out.push(t.trim()); };
  if (c.reg) push(`Reg: ${noPrefix(c.reg, 'Reg:')}`);
  if (c.address) c.address.split(/\r?\n/).filter(l => l.trim()).forEach(push);
  if (cfg.showTaxIds && c.tin) push(`TIN: ${noPrefix(c.tin, 'TIN:')}`);
  if (cfg.showTaxIds && c.sst) push(`SST: ${noPrefix(c.sst, 'SST:')}`);
  if (c.phone) push(`Tel: ${noPrefix(c.phone, 'Tel:')}`);
  if (c.email) push(`Email: ${noPrefix(c.email, 'Email:')}`);
  if (c.website) push(c.website);
  if (cfg.showSocial && socials) push(socials);
  return out;
}

export const totalsRows = (v: DocView) =>
  ([['Subtotal:', v.sub], v.taxLine ? [`${v.taxLine}:`, v.tax!] : null, v.roundLine ? [`${v.roundLine}:`, v.round!] : null,
    v.discountLine ? [`${v.discountLine}:`, v.discount!] : null].filter(Boolean)) as [string, string][];

export const pointsRows = (v: DocView) => {
  const name = v.pointsName ?? 'Points';
  return ([
    v.pointsReloaded ? [`★ ${name} reloaded`, `+${v.pointsReloaded}`] : null,
    v.pointsEarned ? [`★ ${name} earned`, `+${v.pointsEarned}`] : null,
    v.pointsBalance ? [`★ ${name} balance`, v.pointsBalance] : null,
  ].filter(Boolean)) as [string, string][];
};

// ── Print HTML (Classic LiveDocPreview, 560 px sheet scaled onto A4) ─────────

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export function invoiceHtml(v: DocView): string {
  const P = (mm: number) => `${PX(mm).toFixed(2)}px`;
  const m = P(14), amtW = P(32);
  const c = v.cfg, accent = c.headerColor;
  const FONT = `"Inter","Segoe UI",-apple-system,Roboto,Arial,sans-serif`;
  const status = v.payStatus;
  const sClr = status ? (STATUS_CLR[status] ?? '#ca8a04') : '';
  const logo = c.showLogo
    ? (v.company.logoUrl
      ? `<img src="${esc(v.company.logoUrl)}" style="height:${(PX(13) * c.logoSize / 100).toFixed(2)}px;width:auto;max-width:${P(70)};object-fit:contain;display:block"/>`
      : `<div style="width:${(PX(13) * c.logoSize / 100).toFixed(2)}px;height:${(PX(13) * c.logoSize / 100).toFixed(2)}px;border-radius:4px;background:${accent};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${P(5.5)}">${esc(initials(v.company.name))}</div>`)
    : '';
  const co = c.showCompany
    ? `<div style="margin-top:${c.showLogo ? P(3) : '0'}">
        ${v.company.name ? `<div style="font-weight:700;color:#1a1a1a;font-size:${P(5.2)};line-height:1.1;margin-bottom:${P(1.5)}">${esc(v.company.name)}</div>` : ''}
        <div style="font-size:${P(2.8)};color:#686868;line-height:${P(4.2)};white-space:pre-wrap;word-break:break-word">${esc(companyLines(v.company, c).join('\n'))}</div>
      </div>` : '';
  const meta = (l: string, val: string) => `<div><b style="color:#64748b">${l}: </b><span style="color:#1a1a1a">${esc(val)}</span></div>`;
  const cell = (txt: string, w: string | null, right: boolean, extra = '') =>
    `<div style="${w ? `width:${w};flex-shrink:0;` : 'flex:1;'}padding:${P(1.8)} ${P(1.5)};text-align:${right ? 'right' : 'left'};${extra}">${esc(txt)}</div>`;
  const sumRow = (l: string, val: string, style: string) =>
    `<div style="display:flex;justify-content:flex-end"><div style="width:${P(80)};display:flex;align-items:center;${style}">
      <span style="flex:1;text-align:right;padding-right:${P(3)}">${esc(l)}</span><span style="width:${amtW};text-align:right;padding-right:${P(1.5)}">${esc(val)}</span></div></div>`;
  const pts = pointsRows(v);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=560">
<style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:560px;min-height:792px;background:#fff;font-family:${FONT};padding-bottom:${P(14)};zoom:${(793.7 / 560).toFixed(4)}}</style></head><body><div class="sheet">
<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:${P(15)} ${m} 0">
  <div>${logo}${co}</div>
  <div style="text-align:right"><div style="font-size:${P(11)};font-weight:700;color:#1a1a1a;line-height:1">${esc(v.label)}</div></div>
</div>
<div style="margin:${P(3)} ${m};height:1px;background:#ddd"></div>
<div style="margin:${P(3)} ${m} ${P(4)};background:#f5f5f5;display:flex;align-items:flex-start">
  <div style="flex:1;padding:${P(2)} ${P(3)}">
    <div style="font-size:${P(3.2)};font-weight:700;color:#64748b;margin-bottom:${P(1)};text-transform:uppercase;letter-spacing:1px">${esc(v.partyLabel)}</div>
    <div style="font-size:${P(3.8)};font-weight:700;color:#1a1a1a">${esc(v.partyName)}</div>
    ${v.partyPhone ? `<div style="font-size:${P(3)};color:#606060;margin-top:${P(0.5)}">${esc(v.partyPhone)}</div>` : ''}
    ${v.partyEmail ? `<div style="font-size:${P(3)};color:#606060">${esc(v.partyEmail)}</div>` : ''}
    ${v.partyAddress ? `<div style="font-size:${P(3)};color:#606060">${esc(v.partyAddress)}</div>` : ''}
  </div>
  <div style="padding:${P(2)} ${P(3)}"><div style="font-size:${P(3)};line-height:1.8;text-align:right">
    ${meta('No', v.number)}${v.bookingId ? meta('Booking ID', v.bookingId) : ''}${meta('Date', v.date)}${v.dueDate ? meta('Due', v.dueDate) : ''}
    ${status ? `<div style="display:inline-flex;margin-top:${P(1)};padding:${P(0.6)} ${P(2)};border-radius:${P(2)};background:${sClr}22;color:${sClr};font-size:${P(2.5)};font-weight:700;text-transform:uppercase;letter-spacing:1px">${esc(status)}</div>` : ''}
  </div></div>
</div>
<div style="margin:0 ${m}">
  <div style="display:flex;align-items:center;background:${accent};font-size:${P(3)};font-weight:700;color:#fff">
    ${cell('Description', null, false)}${cell('Qty', P(14), true)}${cell('Unit Price', P(24), true)}${cell('Amount', P(28), true)}
  </div>
  ${v.rows.map((r, i) => `<div style="display:flex;align-items:center;background:${i % 2 ? '#f8f9fa' : '#fff'};border-bottom:1px solid #f0f0f0;font-size:${P(3.1)};color:#282828">
    ${cell(r.desc, null, false)}${cell(r.qty, P(14), true)}${cell(r.rate, P(24), true)}${cell(r.amt, P(28), true)}</div>`).join('')}
</div>
<div style="margin:${P(5)} ${m} 0">
  ${totalsRows(v).map(([l, val]) => sumRow(l, val, `font-size:${P(3.1)};color:#606060;margin-bottom:${P(1.5)}`)).join('')}
  ${sumRow('Total', v.total, `background:${accent};padding:${P(2)} 0;font-size:${P(3.8)};font-weight:700;color:#fff`)}
  ${v.paid ? sumRow('Paid:', v.paid, `margin-top:${P(1.5)};font-size:${P(3.1)};color:#16a34a;font-weight:700`) : ''}
  ${v.balance ? sumRow('Balance Due:', v.balance, `margin-top:${P(1)};font-size:${P(3.1)};color:#dc2626;font-weight:700`) : ''}
</div>
${pts.length ? `<div style="margin:${P(1.5)} ${m} 0"><div style="display:flex;justify-content:flex-end"><div style="width:${P(80)};background:#fffbeb;border:1px solid #fde68a;padding:${P(0.8)} 0">
  ${pts.map(([l, val]) => `<div style="display:flex;align-items:center;padding:${P(0.8)} 0;font-size:${P(3.1)};font-weight:700;color:#92400e">
    <span style="flex:1;text-align:right;padding-right:${P(3)}">${esc(l)}</span><span style="width:${amtW};text-align:right;padding-right:${P(1.5)}">${esc(val)}</span></div>`).join('')}
</div></div></div>` : ''}
${v.notes ? `<div style="margin:${P(3)} ${m} 0"><div style="font-size:${P(3.2)};font-weight:700;color:#333;margin-bottom:${P(1)}">Notes</div>
  <div style="font-size:${P(2.8)};color:#888;line-height:1.6;white-space:pre-wrap">${esc(v.notes)}</div></div>` : ''}
${c.showPaymentInfo && c.bankInfo ? `<div style="margin:${P(3)} ${m} ${P(3)}"><div style="font-size:${P(3.2)};font-weight:700;color:#333;margin-bottom:${P(1)}">Payment Information</div>
  <div style="font-size:${P(2.8)};color:#888;line-height:1.7;white-space:pre-wrap">${esc(c.bankInfo)}</div></div>` : ''}
</div></body></html>`;
}
