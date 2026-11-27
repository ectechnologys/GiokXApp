// Message bubbles in the web ChatPanel "workspace" look (chatWorkspace.css
// .cw-bubble): white for the team, the tenant accent for the customer, a tail
// on the first bubble of a run, time + ticks at the bottom right.
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Check, CheckCheck, CircleAlert, Clock, ExternalLink, FileText, Mic, Paperclip, Play } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { cw } from '@/components/chatUi';
import { LinkText } from '@/components/chat/LinkText';
import { isAudio, isAudioLabel, isImageName, isPdf, isVideo, nameColour, quoteSnippet, roleLabel, senderName, type Msg } from '@/components/chat/format';
import { shownPhoto } from '@/components/chat/preview';
import { useT } from '@/lib/i18n';
import { accent } from '@/lib/theme';

const MINE_META = 'rgba(255,255,255,0.78)';
const FAILED = '#dc2626';

export const openUrl = (url: string) => { void WebBrowser.openBrowserAsync(url).catch(() => {}); };

export function DayPill({ label }: { label: string }) {
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayPill}><Text style={styles.dayText}>{label}</Text></View>
    </View>
  );
}

function Tail({ mine, color }: { mine: boolean; color: string }) {
  return (
    <View style={[styles.tail, mine ? { right: -7 } : { left: -7 }]}>
      <Svg width={8} height={11}>
        <Polygon points={mine ? '0,0 8,0 0,11' : '0,0 8,0 8,11'} fill={color} />
      </Svg>
    </View>
  );
}

function Ticks({ m }: { m: Msg }) {
  if (m.failed) return <CircleAlert size={14} color="#ffd6d7" strokeWidth={2.4} />;
  if (m.pending) return <Clock size={12} color={MINE_META} strokeWidth={2.2} />;
  if (m.delivery_status === 'failed') return <CircleAlert size={14} color="#ffd6d7" strokeWidth={2.4} />;
  if (m.delivery_status === 'read') return <CheckCheck size={15} color="#9ff3ff" strokeWidth={2.4} />;
  if (m.delivery_status === 'delivered') return <CheckCheck size={15} color={MINE_META} strokeWidth={2.4} />;
  return <Check size={15} color={MINE_META} strokeWidth={2.4} />;
}

/** A chat photo; one removed by the 12-month clean-up says so instead. */
function ChatImage({ src, width, height }: { src: string; width: number; height: number }) {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.imgGone, { width, height }]}>
        <Text style={styles.imgGoneText}>{t('Photo no longer available')}</Text>
      </View>
    );
  }
  return <Image source={{ uri: shownPhoto(src) }} style={{ width, height, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.06)' }} contentFit="cover" transition={120} onError={() => setFailed(true)} />;
}

function Meta({ m, mine, timeText, overlay }: { m: Msg; mine: boolean; timeText: string; overlay?: boolean }) {
  const { t } = useT();
  return (
    <View style={[styles.meta, overlay && styles.metaOverlay]}>
      {m.edited_at && !m.deleted_at ? <Text style={[styles.metaText, { color: overlay ? '#fff' : mine ? MINE_META : cw.muted, marginRight: 2 }]}>{t('Edited')}</Text> : null}
      <Text style={[styles.metaText, { color: overlay ? '#fff' : mine ? MINE_META : cw.muted }]}>{timeText}</Text>
      {mine ? <Ticks m={m} /> : null}
    </View>
  );
}

function SenderName({ m, slots, padded }: { m: Msg; slots: Map<string, number>; padded?: boolean }) {
  const { t } = useT();
  const role = roleLabel(m);
  return (
    <Text style={[styles.name, padded && { paddingHorizontal: 6, paddingTop: 2 }, { color: nameColour(m, slots, accent) }]} numberOfLines={1}>
      {senderName(m)}
      {role ? <Text style={styles.role}> · {t(role)}</Text> : null}
    </Text>
  );
}

function Quote({ m, mine, byId }: { m: Msg; mine: boolean; byId: Map<string, Msg> }) {
  const { t } = useT();
  const q = byId.get(String(m.reply_to_id));
  const who = !q ? t('Earlier message') : q.sender_type === 'customer' ? t('You') : senderName(q) || t('Customer');
  return (
    <View style={[styles.quote, { backgroundColor: mine ? 'rgba(255,255,255,0.16)' : '#f1f5fb', borderLeftColor: mine ? '#fff' : accent }]}>
      <Text style={[styles.quoteName, { color: mine ? '#fff' : cw.text }]} numberOfLines={1}>{who}</Text>
      <Text style={[styles.quoteText, { color: mine ? '#fff' : cw.text }]} numberOfLines={1}>{q ? quoteSnippet(q) : t('Not loaded')}</Text>
    </View>
  );
}

export const MessageBubble = memo(function MessageBubble({ m, mine, first, slots, byId, timeText, onOpenPhoto, onRetry }: {
  m: Msg; mine: boolean; first: boolean; slots: Map<string, number>; byId: Map<string, Msg>; timeText: string;
  onOpenPhoto: (urls: string[], index: number) => void;
  onRetry?: (m: Msg) => void;
}) {
  const { t } = useT();
  const hasImg = !!m.image_url && !m.deleted_at;
  const hasFile = !!m.file_url && !m.deleted_at;
  const audio = hasFile && isAudio(m);
  const video = hasFile && isVideo(m);
  const fileLabel = m.file_name || t('Attachment');
  const showBody = !m.deleted_at && !!m.body && m.body !== fileLabel
    && !(hasImg && isImageName(m.body)) && !(audio && isAudioLabel(m.body));
  const bg = m.failed ? FAILED : mine ? accent : cw.theirs;
  const fg = mine || m.failed ? '#fff' : cw.text;
  const metaText = m.pending ? t('Sending…') : timeText;
  const failed = !!m.failed;
  // Time + ticks float at the bottom right and the text wraps around them:
  // an invisible copy at the end of the text holds their place.
  const spacer = `   ${m.edited_at ? `${t('Edited')} ` : ''}${metaText.replace(/ /g, ' ')}${mine ? '     ' : ''}`;

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, { marginTop: first ? 8 : 2 }]}>
      <View style={[styles.bubble, hasImg && styles.bubbleImg, { backgroundColor: bg, opacity: m.pending ? 0.75 : 1 },
        first && (mine ? { borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 })]}>
        {first ? <Tail mine={mine} color={bg} /> : null}
        {m.reply_to_id ? <View style={hasImg ? { paddingHorizontal: 2, paddingTop: 2 } : null}><Quote m={m} mine={mine} byId={byId} /></View> : null}
        {first && !mine ? <SenderName m={m} slots={slots} padded={hasImg} /> : null}
        {hasImg ? (
          <Pressable onPress={() => onOpenPhoto([m.image_url!], 0)} accessibilityLabel={t('View photo')}>
            <ChatImage src={m.image_url!} width={240} height={240} />
          </Pressable>
        ) : null}
        {audio ? (
          <Pressable onPress={() => openUrl(m.file_url!)} style={styles.voice} accessibilityLabel={t('Play voice message')}>
            <View style={[styles.voiceBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : accent }]}>
              <Play size={16} color="#fff" fill="#fff" strokeWidth={0} style={{ marginLeft: 2 }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={[styles.voiceBar, { backgroundColor: mine ? 'rgba(255,255,255,0.35)' : cw.line }]}>
                <View style={[styles.voiceKnob, { backgroundColor: mine ? '#fff' : accent }]} />
              </View>
              <Text style={[styles.voiceLabel, { color: mine ? MINE_META : cw.muted }]}>{t('Voice message')}</Text>
            </View>
            <Mic size={16} color={mine ? MINE_META : accent} strokeWidth={2.2} />
          </Pressable>
        ) : null}
        {hasFile && !audio ? (
          <Pressable onPress={() => openUrl(m.file_url!)} style={[styles.file, { backgroundColor: mine ? 'rgba(255,255,255,0.16)' : '#f1f5fb' }]}>
            {video ? <Play size={16} color={fg} strokeWidth={2.2} /> : isPdf(m) ? <FileText size={16} color={fg} strokeWidth={2.2} /> : <Paperclip size={16} color={fg} strokeWidth={2.2} />}
            <Text style={[styles.fileName, { color: fg }]} numberOfLines={1}>{fileLabel}</Text>
            <View style={styles.fileOpen}><ExternalLink size={15} color={fg} strokeWidth={2.2} /></View>
          </Pressable>
        ) : null}
        {m.deleted_at ? (
          <Text style={[styles.body, { color: fg, fontStyle: 'italic', opacity: 0.7 }]}>
            🚫 {mine ? t('You deleted this message') : t('This message was deleted')}
            <Text style={styles.spacer}>{spacer}</Text>
          </Text>
        ) : showBody ? (
          <Text style={[styles.body, { color: fg }, hasImg && { paddingHorizontal: 6, paddingTop: 4, paddingBottom: 3 }]}>
            <LinkText text={m.body} />
            {failed ? null : <Text style={styles.spacer}>{spacer}</Text>}
          </Text>
        ) : null}
        {failed ? (
          <View style={styles.metaFlow}><Meta m={m} mine={mine} timeText={metaText} /></View>
        ) : hasImg && !showBody ? (
          <Meta m={m} mine={mine} timeText={metaText} overlay />
        ) : showBody || m.deleted_at ? (
          <View style={[styles.metaAbs, hasImg && { right: 12, bottom: 7 }]}><Meta m={m} mine={mine} timeText={metaText} /></View>
        ) : (
          <View style={styles.metaFlow}><Meta m={m} mine={mine} timeText={metaText} /></View>
        )}
        {failed ? (
          <Text style={styles.failNote}>
            ⚠ {t('Not sent')}{typeof m.failed === 'string' && m.failed ? ` — ${t(m.failed)}` : ''}
            {onRetry ? <Text style={styles.retry} onPress={() => onRetry(m)}>{'  '}{t('Tap to retry')}</Text> : null}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export const AlbumBubble = memo(function AlbumBubble({ items, mine, first, slots, timeText, onOpenPhoto }: {
  items: Msg[]; mine: boolean; first: boolean; slots: Map<string, number>; timeText: string;
  onOpenPhoto: (urls: string[], index: number) => void;
}) {
  const { t } = useT();
  const last = items[items.length - 1];
  const urls = items.map(a => a.image_url!);
  const shown = items.slice(0, 4);
  const bg = mine ? accent : cw.theirs;
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, { marginTop: first ? 8 : 2 }]}>
      <View style={[styles.bubble, styles.bubbleImg, { backgroundColor: bg, opacity: items.some(a => a.pending) ? 0.75 : 1 },
        first && (mine ? { borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 })]}>
        {first ? <Tail mine={mine} color={bg} /> : null}
        {first && !mine ? <SenderName m={items[0]} slots={slots} padded /> : null}
        <View style={styles.grid}>
          {shown.map((a, i) => {
            const more = i === 3 && items.length > 4 ? items.length - 4 : 0;
            const wide = items.length === 3 && i === 0;
            return (
              <Pressable key={a.id} onPress={() => onOpenPhoto(urls, i)} accessibilityLabel={more ? t('View {n} more photos', { n: more }) : t('View photo')}>
                <ChatImage src={a.image_url!} width={wide ? 244 : 120} height={wide ? 150 : 120} />
                {more > 0 ? (
                  <View style={styles.more}><Text style={styles.moreText}>+{more}</Text></View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Meta m={last} mine={mine} timeText={last.pending ? t('Sending…') : timeText} overlay />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dayRow: { alignItems: 'center', marginVertical: 12 },
  dayPill: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, boxShadow: '0 1px 0.5px rgba(15,23,42,0.08)' },
  dayText: { fontSize: 11.5, fontWeight: '500', color: cw.sub },
  row: { flexDirection: 'row', paddingHorizontal: '6%' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%', paddingTop: 6, paddingHorizontal: 9, paddingBottom: 7, borderRadius: 10,
    boxShadow: '0 1px 0.5px rgba(15,23,42,0.08)',
  },
  bubbleImg: { padding: 4 },
  tail: { position: 'absolute', top: 0, width: 8, height: 11 },
  name: { fontSize: 12.5, fontWeight: '600', marginBottom: 2 },
  role: { fontWeight: '400', opacity: 0.8 },
  body: { fontSize: 14, lineHeight: 19.3 },
  spacer: { fontSize: 11, color: 'transparent' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, lineHeight: 13 },
  metaAbs: { position: 'absolute', right: 9, bottom: 6 },
  metaFlow: { alignSelf: 'flex-end', marginTop: 2 },
  metaOverlay: { position: 'absolute', right: 10, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.4)' },
  imgGone: { borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  imgGoneText: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  grid: { width: 244, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  more: { ...StyleSheet.absoluteFill, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  quote: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4, borderLeftWidth: 3 },
  quoteName: { fontSize: 12.5, fontWeight: '600' },
  quoteText: { fontSize: 12.5, opacity: 0.85 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 240, maxWidth: '100%', paddingTop: 4, paddingBottom: 2 },
  voiceBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  voiceBar: { height: 3, borderRadius: 2, marginVertical: 8.5, justifyContent: 'center' },
  voiceKnob: { position: 'absolute', left: -6, width: 12, height: 12, borderRadius: 6 },
  voiceLabel: { fontSize: 11, lineHeight: 12, marginTop: 2 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4, paddingLeft: 10, paddingRight: 6, paddingVertical: 6, borderRadius: 8 },
  fileName: { fontSize: 13, fontWeight: '600', maxWidth: 180, flexShrink: 1 },
  fileOpen: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' },
  failNote: { marginTop: 6, borderRadius: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 11.5, lineHeight: 15, fontWeight: '500', backgroundColor: '#fff', color: FAILED },
  retry: { fontWeight: '700', textDecorationLine: 'underline' },
});
