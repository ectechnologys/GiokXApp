// One appointment, exactly like a row of the web's "My appointments" card:
// everything (chat, pay, add-ons, photos, cancel, crew times, rating) happens
// inside the row, with no separate detail page.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { CalendarDays, Camera, CheckCircle2, Clock, Download, ExternalLink, MapPin, MessageCircle, Plus, Star, Users, X, Zap } from 'lucide-react-native';
import { memo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrewModal } from '@/components/booking/Crew';
import { AddExtras, VanPills, usePayment } from '@/components/booking/Extras';
import { Badge } from '@/components/web';
import type { CustomerBooking } from '@/lib/api';
import { deleteBookingPhoto, isImageUrl, pickPhoto, startBookingPayment, submitReview, uploadBookingPhoto, type MyReview } from '@/lib/extras';
import { fmtBookingDate, fmtBookingTime, t } from '@/lib/i18n';
import { queryClient } from '@/lib/queries';
import { accent, accentDeep, accentSoft, badgeColors, gray } from '@/lib/theme';

const MAX_PHOTOS = 5;

export function formatBookingId(id?: string | null): string {
  const hex = (id ?? '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return hex ? `BK-${hex}` : '';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fmtTeamStamp(iso: string, timeFormat: '12h' | '24h') {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${date} · ${fmtBookingTime(`${d.getHours()}:${d.getMinutes()}`, timeFormat)}`;
}

const refresh = () => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  queryClient.invalidateQueries({ queryKey: ['coins'] }),
]);

export const BookingRow = memo(function BookingRow({ b, token, timeFormat, muted, chatOn, onCancel, cancelling, review, googleUrl, googleThreshold, tenantName }: {
  b: CustomerBooking;
  token: string;
  timeFormat: '12h' | '24h';
  muted?: boolean;
  chatOn?: boolean;
  onCancel?: (b: CustomerBooking) => void;
  cancelling?: boolean;
  review?: MyReview;
  googleUrl?: string;
  googleThreshold?: number;
  tenantName?: string;
}) {
  const insets = useSafeAreaInsets();
  const isCancelled = b.status === 'cancelled';
  const s = badgeColors(b.status);
  const photos = (b.attachment_urls ?? []).filter(u => u && isImageUrl(u));
  const paid = b.payment_status === 'paid' || b.payment_status === 'cash';
  const partialRedeem = b.payment_status === 'redemption' && b.outstanding_amount > 0;
  const showRedemptionTag = b.redeemed_amount > 0 && b.payment_status !== 'redemption';
  const addr = [[b.unit_number, b.address].filter(Boolean).join(', '), [b.postcode, b.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

  const pay = usePayment(token);
  const [paying, setPaying] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [revRating, setRevRating] = useState(0);
  const [revText, setRevText] = useState('');
  const [revBusy, setRevBusy] = useState(false);
  const [revErr, setRevErr] = useState<string | null>(null);

  const doPay = async () => {
    setPaying(true); setPayMsg(null);
    try {
      const out = await pay.run(() => startBookingPayment(token, b.id));
      setPayMsg(out === 'done' ? t('Payment received — your booking is now marked paid.') : t("The payment didn't complete — nothing was charged."));
    } catch (e) {
      setPayMsg((e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  const addPhoto = () => {
    const go = (src: 'camera' | 'library') => async () => {
      setPhotoErr(null);
      try {
        const f = await pickPhoto(src);
        if (!f) return;
        setUploading(true);
        await uploadBookingPhoto(token, b.id, f);
        await refresh();
      } catch (e) {
        setPhotoErr((e as Error).message);
      } finally {
        setUploading(false);
      }
    };
    Alert.alert(t('Add photo'), undefined, [
      { text: t('Take photo'), onPress: go('camera') },
      { text: t('Choose from gallery'), onPress: go('library') },
      { text: t('Cancel'), style: 'cancel' },
    ]);
  };

  const removePhoto = (url: string) => {
    Alert.alert(t('Remove this photo?'), undefined, [
      { text: t('Keep'), style: 'cancel' },
      {
        text: t('Remove'), style: 'destructive', onPress: async () => {
          setViewing(null); setDeleting(url); setPhotoErr(null);
          try { await deleteBookingPhoto(token, b.id, url); await refresh(); }
          catch (e) { setPhotoErr((e as Error).message); }
          finally { setDeleting(null); }
        },
      },
    ]);
  };

  const sendReview = async () => {
    if (revBusy) return;
    setRevBusy(true); setRevErr(null);
    try {
      await submitReview(token, b.id, revRating, revText.trim());
      await queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
    } catch (e) {
      setRevErr(e instanceof Error ? e.message : 'Could not submit review');
    } finally {
      setRevBusy(false);
    }
  };

  const dim = isCancelled || muted;
  return (
    <View style={[styles.row, dim ? styles.rowDim : null]}>
      <View style={styles.top}>
        <View style={styles.name}>
          <CheckCircle2 size={14} color={s.text} strokeWidth={2} />
          <Text style={styles.nameText} numberOfLines={1}>{b.service_name}</Text>
        </View>
        <View style={styles.badges}>
          <Badge label={t(cap(b.status))} tone={b.status} />
          {!isCancelled && (
            <>
              <Badge label={t(cap(b.payment_status))} tone={b.payment_status} />
              {showRedemptionTag && <Badge label={t('Redemption')} tone="redemption" />}
              {partialRedeem && <Badge label={t('Unpaid')} tone="unpaid" />}
            </>
          )}
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaItem}><CalendarDays size={12} color={gray[500]} strokeWidth={2} /><Text style={styles.metaText}>{fmtBookingDate(b.booking_date)}</Text></View>
        <View style={styles.metaItem}><Clock size={12} color={gray[500]} strokeWidth={2} /><Text style={styles.metaText}>{fmtBookingTime(b.start_time, timeFormat)}</Text></View>
      </View>

      {addr ? (
        <View style={styles.addr}>
          <MapPin size={12} color={gray[500]} strokeWidth={2} style={{ marginTop: 1 }} />
          <Text style={styles.addrText} numberOfLines={1}>{addr}</Text>
        </View>
      ) : null}

      <View style={styles.idRow}>
        <View style={styles.addons}>
          {b.addons.length > 0 && <Plus size={12} color={gray[400]} strokeWidth={2.5} />}
          {b.addons.map((n, i) => (
            <View key={i} style={styles.addonPill}><Text style={styles.addonText}>{n}</Text></View>
          ))}
          {!isCancelled && !b.team_completed_at && (
            <Pressable onPress={() => setAddOpen(true)} style={styles.addBtn}>
              <Plus size={12} color="#fff" strokeWidth={2.75} /><Text style={styles.addBtnText}>{t('Add')}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.idRight}>
          {(b.assignees?.length ?? 0) > 0 && (
            <Pressable onPress={() => setCrewOpen(true)} hitSlop={8} style={{ padding: 4 }} accessibilityLabel={t('View assigned crew')}>
              <Users size={14} color={gray[400]} strokeWidth={2.25} />
            </Pressable>
          )}
          {chatOn && b.chat_open && (
            <Pressable onPress={() => router.push({ pathname: '/booking/[id]/chat', params: { id: b.id } })} style={styles.chatBtn}>
              <MessageCircle size={14} color={gray[500]} strokeWidth={2.5} /><Text style={styles.chatText}>{t('Chat')}</Text>
            </Pressable>
          )}
          {paid && (
            <Pressable onPress={() => router.push({ pathname: '/booking/[id]/invoice', params: { id: b.id } })} hitSlop={8} style={{ padding: 4 }}
              accessibilityLabel={t('Download invoice')}>
              <Download size={14} color={gray[400]} strokeWidth={2.25} />
            </Pressable>
          )}
          <Text style={styles.bkId}>{formatBookingId(b.id)}</Text>
        </View>
      </View>

      {!isCancelled && b.outstanding_amount > 0 && (
        <View style={styles.due}>
          <Text style={styles.dueLabel}>{t('Amount due').toUpperCase()}</Text>
          <View style={styles.dueRight}>
            <Text style={styles.dueAmt}>RM {b.outstanding_amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <Pressable onPress={doPay} disabled={paying} style={[styles.payBtn, paying && { opacity: 0.6 }]}>
              {paying ? <ActivityIndicator size="small" color="#fff" /> : <Zap size={14} color="#fff" strokeWidth={2.5} />}
              <Text style={styles.payText}>{paying ? t('Redirecting…') : t('Pay')}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {payMsg && <Text style={styles.small}>{payMsg}</Text>}

      {(photos.length > 0 || !isCancelled) && (
        <View style={styles.divided}>
          <View style={styles.photoRow}>
            <View style={styles.thumbs}>
              {photos.map(u => (
                <View key={u}>
                  <Pressable onPress={() => setViewing(u)}>
                    <Image source={{ uri: u }} style={styles.thumb} contentFit="cover" />
                  </Pressable>
                  {!isCancelled && (
                    <Pressable onPress={() => removePhoto(u)} disabled={deleting === u} style={styles.thumbX} hitSlop={6}>
                      {deleting === u ? <ActivityIndicator size={10} color={gray[500]} /> : <X size={12} color={gray[500]} strokeWidth={3} />}
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
            <View style={styles.photoActions}>
              {!isCancelled && (photos.length >= MAX_PHOTOS
                ? <Text style={styles.maxText}>{t('Max {n} photos', { n: MAX_PHOTOS })}</Text>
                : (
                  <Pressable onPress={addPhoto} disabled={uploading} style={[styles.ghostBtn, uploading && { opacity: 0.6 }]}>
                    {uploading ? <ActivityIndicator size={12} color={gray[500]} /> : <Camera size={12} color={gray[500]} strokeWidth={2.5} />}
                    <Text style={styles.ghostText}>{uploading ? t('Uploading…') : t('Add photo')}</Text>
                  </Pressable>
                ))}
              {onCancel && (
                <Pressable onPress={() => onCancel(b)} disabled={cancelling} style={[styles.ghostBtn, cancelling && { opacity: 0.6 }]}>
                  {cancelling ? <ActivityIndicator size={12} color={gray[500]} /> : <X size={12} color={gray[500]} strokeWidth={2.5} />}
                  <Text style={styles.ghostText}>{t('Cancel')}</Text>
                </Pressable>
              )}
            </View>
          </View>
          {photoErr && <Text style={[styles.small, { color: '#dc2626', marginTop: 6 }]}>{photoErr}</Text>}
        </View>
      )}

      <VanPills b={b} token={token} />

      {(b.team_arrived_at || b.team_started_at || b.team_completed_at) && (
        <View style={[styles.divided, { gap: 4 }]}>
          {b.team_arrived_at && (
            <View style={styles.stamp}><MapPin size={12} color={gray[400]} strokeWidth={2.5} /><Text style={styles.stampLabel}>{t('Arrived')}</Text><Text style={styles.stampText}>{fmtTeamStamp(b.team_arrived_at, timeFormat)}</Text></View>
          )}
          {b.team_started_at && (
            <View style={styles.stamp}><Clock size={12} color={gray[400]} strokeWidth={2.5} /><Text style={styles.stampLabel}>{t('Started')}</Text><Text style={styles.stampText}>{fmtTeamStamp(b.team_started_at, timeFormat)}</Text></View>
          )}
          {b.team_completed_at && (
            <View style={styles.stamp}><CheckCircle2 size={12} color="#10b981" strokeWidth={2.5} /><Text style={styles.stampLabel}>{t('Completed')}</Text><Text style={styles.stampText}>{fmtTeamStamp(b.team_completed_at, timeFormat)}</Text></View>
          )}
        </View>
      )}

      {!!b.team_completed_at && !isCancelled && (
        <View style={[styles.divided, { gap: 8 }]}>
          {review ? (
            <>
              <View style={styles.revRow}>
                <Text style={styles.stampLabel}>{t('Your rating')}</Text>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(n => <Star key={n} size={14} strokeWidth={2} color={n <= review.rating ? '#fbbf24' : gray[200]} fill={n <= review.rating ? '#fbbf24' : 'none'} />)}
                </View>
                <Text style={[styles.small, { color: gray[400] }]}>{t('Thanks for your feedback!')}</Text>
              </View>
              {!!googleUrl && review.rating >= (googleThreshold ?? 4) && (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(googleUrl)} style={styles.google}>
                  <Star size={14} color={accentDeep} fill={accentDeep} strokeWidth={0} />
                  <Text style={styles.googleText}>{t('Loved it? Share on Google')}</Text>
                  <ExternalLink size={12} color={accentDeep} strokeWidth={2.5} />
                </Pressable>
              )}
              {review.reply_text ? (
                <View style={styles.reply}>
                  <Text style={styles.replyHead}>{t('Response from {name}', { name: tenantName || t('the team') })}</Text>
                  <Text style={styles.replyText}>{review.reply_text}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.revRow}>
                <Text style={styles.stampLabel}>{t('Rate your service')}</Text>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Pressable key={n} onPress={() => setRevRating(n)} hitSlop={4} style={{ padding: 2 }}>
                      <Star size={20} strokeWidth={2} color={n <= revRating ? '#fbbf24' : gray[300]} fill={n <= revRating ? '#fbbf24' : 'none'} />
                    </Pressable>
                  ))}
                </View>
              </View>
              {revRating > 0 && (
                <>
                  <TextInput value={revText} onChangeText={v => setRevText(v.slice(0, 1000))} multiline
                    placeholder={t('Tell others about your experience (optional)')} placeholderTextColor={gray[400]} style={styles.revInput} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={sendReview} disabled={revBusy} style={[styles.payBtn, { paddingVertical: 7 }, revBusy && { opacity: 0.6 }]}>
                      {revBusy && <ActivityIndicator size={12} color="#fff" />}
                      <Text style={styles.payText}>{t('Submit review')}</Text>
                    </Pressable>
                    {revErr && <Text style={[styles.small, { color: '#dc2626', flex: 1 }]}>{revErr}</Text>}
                  </View>
                </>
              )}
            </>
          )}
        </View>
      )}

      <CrewModal assignees={b.assignees ?? []} visible={crewOpen} onClose={() => setCrewOpen(false)} />

      {/* Add-ons sheet */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <AddExtras b={b} token={token} startOpen onDone={() => setAddOpen(false)} />
          </ScrollView>
        </View>
      </Modal>

      {/* Waiting for HitPay */}
      <Modal visible={pay.waiting} transparent animationType="fade">
        <View style={styles.waitWrap}>
          <View style={styles.waitCard}>
            <ActivityIndicator color={accent} />
            <Text style={{ color: gray[700], textAlign: 'center' }}>{t('Confirming your payment…')}</Text>
            <Pressable onPress={pay.cancel} hitSlop={8}><Text style={{ color: '#dc2626', fontWeight: '600' }}>{t('I cancelled the payment')}</Text></Pressable>
          </View>
        </View>
      </Modal>

      {/* Photo viewer */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing && <Image source={{ uri: viewing }} style={{ flex: 1, width: '100%' }} contentFit="contain" />}
          <Pressable onPress={() => setViewing(null)} style={[styles.viewerClose, { top: insets.top + 12 }]}><X size={22} color="#fff" /></Pressable>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { backgroundColor: '#fff', borderWidth: 1, borderColor: gray[100], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  rowDim: { backgroundColor: gray[50], borderColor: gray[200], opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  nameText: { fontSize: 14, fontWeight: '500', color: gray[800], flexShrink: 1 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0, maxWidth: '60%' },
  meta: { flexDirection: 'row', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: gray[500] },
  addr: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  addrText: { fontSize: 11, color: gray[500], flex: 1 },
  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  addons: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 },
  addonPill: { backgroundColor: accentSoft, borderWidth: 1, borderColor: accentDeep, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  addonText: { fontSize: 10, fontWeight: '600', color: accentDeep },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  addBtnText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  idRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  chatText: { fontSize: 11, fontWeight: '600', color: gray[500] },
  bkId: { fontSize: 10, color: gray[400], fontFamily: 'monospace' },
  due: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: gray[100] },
  dueLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: '#ea580c' },
  dueRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dueAmt: { fontSize: 14, fontWeight: '700', color: '#c2410c', fontFamily: 'monospace' },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  payText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  small: { fontSize: 11, color: gray[500] },
  divided: { paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: gray[100] },
  photoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 },
  thumb: { width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: gray[200] },
  thumbX: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: gray[300],
    alignItems: 'center', justifyContent: 'center',
  },
  photoActions: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  maxText: { fontSize: 11, color: gray[400], fontWeight: '500' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: gray[200], borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  ghostText: { fontSize: 11, fontWeight: '600', color: gray[500] },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stampLabel: { fontSize: 11, fontWeight: '600', color: gray[600] },
  stampText: { fontSize: 11, color: gray[500] },
  revRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  revInput: { borderWidth: 1, borderColor: gray[200], borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, minHeight: 52, textAlignVertical: 'top', color: gray[900] },
  google: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: accentSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  googleText: { fontSize: 12, fontWeight: '700', color: accentDeep },
  reply: { paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: gray[200] },
  replyHead: { fontSize: 10, fontWeight: '600', color: gray[500], marginBottom: 2 },
  replyText: { fontSize: 12, color: gray[600], lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%' },
  waitWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  waitCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 12, alignItems: 'center', alignSelf: 'stretch' },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerClose: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
