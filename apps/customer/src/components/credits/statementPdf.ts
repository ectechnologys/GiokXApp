// Credits statement PDF — the web PointsHistoryCard exportPdf (jsPDF +
// autoTable, A4 portrait in points) redrawn as absolutely-positioned print
// HTML for expo-print, at the same coordinates, sizes and colours. Pages are
// laid out here (not by the print engine) so every page gets the footer with
// "Page x of y" and the table header repeats, like autoTable.
import { Image } from 'react-native';

export interface StatementCompany {
  name?: string; address?: string; logo_url?: string; registration?: string;
  phone?: string; email?: string; website?: string; tin?: string; sst?: string;
}

export interface StatementRow { date: string; desc: string; type: string; amount: string; balance: string }

export interface StatementInput {
  company: StatementCompany | null;
  pointsName: string;
  balance: number;
  periodLabel: string;
  customer: { name: string; phone: string | null; email: string | null };
  address: { unit_number?: string; address?: string; postcode?: string; city?: string } | null;
  expires: string | null;
  rows: StatementRow[];
}

const PAGE_W = 595, PAGE_H = 842, M = 40;
const ACCENT = 'rgb(31,128,255)', INK = 'rgb(25,35,55)', MUTE = 'rgb(110,120,140)', RULE = 'rgb(225,230,240)';
const FONT = 'Helvetica, Arial, sans-serif';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** "Nov 27, 2026" (statement stays English, like the web). */
export const stmtDate = (iso: string) =>
  new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

/** Rough jsPDF splitTextToSize for Helvetica (≈0.5 em per character). */
function wrap(text: string, widthPt: number, size: number): string[] {
  const max = Math.max(1, Math.floor(widthPt / (size * 0.52)));
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= max) line += ' ' + word;
      else { out.push(line); line = word; }
      while (line.length > max) { out.push(line.slice(0, max)); line = line.slice(max); }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

/** Text whose baseline sits at y (jsPDF doc.text semantics). */
function txt(s: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: string; right?: boolean } = {}) {
  const pos = opts.right ? `right:${PAGE_W - x}pt` : `left:${x}pt`;
  return `<div style="position:absolute;${pos};top:${(y - size * 0.8).toFixed(2)}pt;font-size:${size}pt;line-height:1;white-space:nowrap;`
    + `font-weight:${opts.bold ? 700 : 400};color:${opts.color ?? INK};text-align:${opts.right ? 'right' : 'left'}">${esc(s)}</div>`;
}

const labelled = (label: string, value: string) => (/^[A-Za-z][\w\s]*:/.test(value.trim()) ? value : `${label}: ${value}`);

async function logoSize(url: string): Promise<{ w: number; h: number } | null> {
  if (!url) return null;
  try {
    const { width, height } = await Image.getSize(url);
    return width > 0 && height > 0 ? { w: width, h: height } : null;
  } catch {
    return null;
  }
}

export async function statementHtml(p: StatementInput): Promise<string> {
  const company = p.company ?? {};
  const els: string[] = [];

  // ── Header: company (left) ──
  let leftY = M + 18;
  const logo = await logoSize(company.logo_url || '');
  if (logo) {
    const ratio = Math.min(110 / logo.w, 50 / logo.h);
    const w = logo.w * ratio, h = logo.h * ratio;
    els.push(`<img src="${esc(company.logo_url!)}" style="position:absolute;left:${M}pt;top:${leftY - 8}pt;width:${w.toFixed(2)}pt;height:${h.toFixed(2)}pt"/>`);
    leftY += h + 12;
  } else if (company.name) {
    els.push(`<div style="position:absolute;left:${M}pt;top:${leftY - 6}pt;width:46pt;height:46pt;border-radius:6pt;background:rgb(232,240,254)"></div>`);
    els.push(`<div style="position:absolute;left:${M}pt;width:46pt;top:${(leftY + 22 - 20 * 0.8).toFixed(2)}pt;font-size:20pt;line-height:1;font-weight:700;color:${ACCENT};text-align:center">${esc(company.name.trim().charAt(0).toUpperCase())}</div>`);
    leftY += 56;
  }
  if (company.name) { els.push(txt(company.name, M, leftY, 14, { bold: true })); leftY += 14; }
  if (company.registration) { els.push(txt(labelled('Reg', company.registration), M, leftY, 8, { color: MUTE })); leftY += 11; }
  if (company.address) {
    const lines = wrap(company.address, 220, 8);
    lines.forEach((l, i) => els.push(txt(l, M, leftY + i * 10, 8, { color: MUTE })));
    leftY += lines.length * 10 + 1;
  }
  const contact = [company.phone && labelled('Tel', company.phone), company.email, company.website].filter(Boolean) as string[];
  if (contact.length) { els.push(txt(contact.join('  ·  '), M, leftY, 8, { color: MUTE })); leftY += 11; }
  const tax = [company.tin && labelled('TIN', company.tin), company.sst && labelled('SST', company.sst)].filter(Boolean) as string[];
  if (tax.length) { els.push(txt(tax.join('  ·  '), M, leftY, 8, { color: MUTE })); leftY += 11; }

  // ── Right: title, points name, balance pill ──
  const rightX = PAGE_W - M;
  els.push(txt('Statement', rightX, M + 22, 20, { bold: true, right: true }));
  els.push(txt(p.pointsName.toUpperCase(), rightX, M + 36, 9, { color: MUTE, right: true }));
  const pillY = M + 50, pillH = 44;
  els.push(`<div style="position:absolute;right:${M}pt;top:${pillY}pt;height:${pillH}pt;padding:0 14pt;border-radius:8pt;background:${ACCENT};text-align:right">
    <div style="margin-top:${(15 - 8 * 0.8).toFixed(2)}pt;font-size:8pt;line-height:1;color:rgb(232,240,254)">CURRENT BALANCE</div>
    <div style="margin-top:${(36 - 15 - 22 * 0.8).toFixed(2)}pt;font-size:22pt;line-height:1;font-weight:700;color:#fff">${esc(p.balance.toLocaleString('en-US'))}</div></div>`);

  // ── Statement for / Period / Issued strip ──
  const stripY = Math.max(leftY + 10, pillY + pillH + 24);
  els.push(`<div style="position:absolute;left:${M}pt;width:${PAGE_W - 2 * M}pt;top:${stripY - 14 - 0.3}pt;height:0.6pt;background:${RULE}"></div>`);
  els.push(txt('STATEMENT FOR', M, stripY, 8, { bold: true, color: MUTE }));
  els.push(txt('PERIOD', M + 260, stripY, 8, { bold: true, color: MUTE }));
  els.push(txt('ISSUED', rightX, stripY, 8, { bold: true, color: MUTE, right: true }));
  els.push(txt(p.customer.name, M, stripY + 16, 11, { bold: true }));
  let custY = stripY + 30;
  if (p.customer.phone) { els.push(txt(p.customer.phone, M, custY, 9, { color: MUTE })); custY += 11; }
  if (p.customer.email) { els.push(txt(p.customer.email, M, custY, 9, { color: MUTE })); custY += 11; }
  if (p.address) {
    const addr = [p.address.unit_number, p.address.address].filter(Boolean).join(', ');
    const city = [p.address.postcode, p.address.city].filter(Boolean).join(' ');
    if (addr) { const ls = wrap(addr, 220, 9); ls.forEach((l, i) => els.push(txt(l, M, custY + i * 10, 9, { color: MUTE }))); custY += ls.length * 10; }
    if (city) { els.push(txt(city, M, custY, 9, { color: MUTE })); custY += 11; }
  }
  els.push(txt(p.periodLabel, M + 260, stripY + 16, 11, { bold: true }));
  els.push(txt(`${p.rows.length} transaction${p.rows.length === 1 ? '' : 's'}`, M + 260, stripY + 30, 8, { color: MUTE }));
  els.push(txt(stmtDate(new Date().toISOString()), rightX, stripY + 16, 11, { bold: true, right: true }));
  if (p.expires) {
    els.push(txt('MEMBER EXPIRES', rightX, stripY + 36, 8, { bold: true, color: MUTE, right: true }));
    els.push(txt(stmtDate(p.expires), rightX, stripY + 52, 11, { bold: true, right: true }));
  }
  const tableStart = Math.max(custY, stripY + 60) + 12;

  // ── Table, paginated like autoTable (head repeats, 40pt margins) ──
  const LINE = 9 * 1.15, PAD = 6;
  const rowH = (r: StatementRow) => Math.max(wrap(r.desc, 259 - 2 * PAD, 9).length, wrap(r.date, 70 - 2 * PAD, 9).length) * LINE + 2 * PAD;
  const headH = LINE + 2 * PAD;
  const bottom = PAGE_H - 40;
  const pages: { start: number; rows: { r: StatementRow; i: number }[] }[] = [{ start: tableStart, rows: [] }];
  let y = tableStart + headH;
  p.rows.forEach((r, i) => {
    const h = rowH(r);
    if (y + h > bottom && pages[pages.length - 1].rows.length > 0) { pages.push({ start: M, rows: [] }); y = M + headH; }
    pages[pages.length - 1].rows.push({ r, i });
    y += h;
  });

  const td = (s: string, align: string, extra = '') =>
    `<td style="padding:${PAD}pt;border:0.4pt solid rgb(230,234,242);text-align:${align};vertical-align:top;${extra}">${esc(s)}</td>`;
  const table = (rows: { r: StatementRow; i: number }[]) => `
    <table style="width:${PAGE_W - 2 * M}pt;border-collapse:collapse;table-layout:fixed;font-size:9pt;line-height:1.15;color:${INK}">
      <colgroup><col style="width:70pt"/><col/><col style="width:56pt"/><col style="width:60pt"/><col style="width:70pt"/></colgroup>
      <tr style="background:${ACCENT};color:#fff;font-weight:700">${['Date', 'Description', 'Type', 'Amount', 'Balance'].map(h => td(h, 'left')).join('')}</tr>
      ${rows.map(({ r, i }) => `<tr style="background:${i % 2 === 0 ? 'rgb(248,250,253)' : '#fff'}">${td(r.date, 'left')}${td(r.desc, 'left', 'word-wrap:break-word')}${td(r.type, 'center')}${td(r.amount, 'right')}${td(r.balance, 'right')}</tr>`).join('')}
    </table>`;

  const leftFooter = [company.name, company.registration && `Reg ${company.registration}`].filter(Boolean).join(' · ');
  const pageHtml = pages.map((pg, k) => `
    <div class="page">
      ${k === 0 ? `<div style="position:absolute;left:0;top:0;width:${PAGE_W}pt;height:6pt;background:${ACCENT}"></div>${els.join('')}` : ''}
      <div style="position:absolute;left:${M}pt;top:${pg.start}pt">${table(pg.rows)}</div>
      <div style="position:absolute;left:${M}pt;width:${PAGE_W - 2 * M}pt;top:${PAGE_H - 36 - 0.2}pt;height:0.4pt;background:${RULE}"></div>
      ${leftFooter ? txt(leftFooter, M, PAGE_H - 22, 7, { color: MUTE }) : ''}
      ${txt(`Page ${k + 1} of ${pages.length}`, PAGE_W - M, PAGE_H - 22, 7, { color: MUTE, right: true })}
    </div>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:${PAGE_W}pt ${PAGE_H}pt;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:${FONT}}
    .page{position:relative;width:${PAGE_W}pt;height:${PAGE_H - 1}pt;overflow:hidden;page-break-after:always;break-after:page}
    .page:last-child{page-break-after:auto;break-after:auto}
  </style></head><body>${pageHtml}</body></html>`;
}
