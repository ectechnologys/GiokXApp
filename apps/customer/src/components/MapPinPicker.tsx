// The web MapPinPicker: a Google map with the pin fixed in the centre —
// dragging the map moves the coordinates under it. "Drag map to adjust pin"
// hint, + / − zoom, and the 6-decimal coordinates line underneath. `locked`
// (a saved address in the booking flow) shows the pin but can't be moved.
import { MapPin, Minus, Move, Plus } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';

import { useT } from '@/lib/i18n';
import { GMAPS_KEY } from '@/lib/places';
import { gray } from '@/lib/theme';

interface Coords { lat: number; lng: number }

// Zoom 17 on the web ≈ this span on a phone-width map.
const DELTA = 0.0035;
const same = (a: Coords, b: Coords) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;

function Pin() {
  return (
    <Svg width={30} height={40} viewBox="0 0 30 40">
      <Path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0z" fill="#ea4335" />
      <Path d="M15 0C6.7 0 0 6.6 0 14.8 0 25.9 15 40 15 40s15-14.1 15-25.2C30 6.6 23.3 0 15 0z" fill="none" stroke="#b31412" strokeWidth={1} />
      <Circle cx={15} cy={14.5} r={5.2} fill="#3a0806" />
    </Svg>
  );
}

export function MapPinPicker({ coords, onCoordsChange, height = 200, locked = false }: {
  coords: Coords | null;
  onCoordsChange: (c: Coords) => void;
  height?: number;
  locked?: boolean;
}) {
  const { t } = useT();
  const map = useRef<MapView>(null);
  const region = useRef<Region | null>(null);
  const fromDrag = useRef<Coords | null>(null);

  // A pin set from outside (address search, geocode) recentres the map.
  useEffect(() => {
    if (!coords) return;
    if (fromDrag.current && same(fromDrag.current, coords)) return;
    const r = { latitude: coords.lat, longitude: coords.lng, latitudeDelta: region.current?.latitudeDelta ?? DELTA, longitudeDelta: region.current?.longitudeDelta ?? DELTA };
    map.current?.animateToRegion(r, 350);
  }, [coords]);

  if (!GMAPS_KEY || !coords) return null;

  const zoom = (k: number) => {
    const r = region.current;
    if (!r) return;
    map.current?.animateToRegion({ ...r, latitudeDelta: r.latitudeDelta * k, longitudeDelta: r.longitudeDelta * k }, 200);
  };

  return (
    <View style={styles.box}>
      <View style={{ height }}>
        <MapView
          ref={map}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }}
          scrollEnabled={!locked}
          zoomEnabled={!locked}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          onRegionChangeComplete={(r, details) => {
            region.current = r;
            if (locked || !details?.isGesture) return;
            const c = { lat: Math.round(r.latitude * 1e6) / 1e6, lng: Math.round(r.longitude * 1e6) / 1e6 };
            fromDrag.current = c;
            onCoordsChange(c);
          }}
        />
        <View pointerEvents="none" style={styles.pinWrap}>
          <View style={{ transform: [{ translateY: -20 }] }}><Pin /></View>
        </View>
        <View pointerEvents="none" style={styles.shadow} />
        {!locked && (
          <>
            <View pointerEvents="none" style={styles.hintWrap}>
              <View style={styles.hint}>
                <Move size={12} color={gray[600]} />
                <Text style={styles.hintText}>{t('Drag map to adjust pin')}</Text>
              </View>
            </View>
            <View style={styles.zoom}>
              <Pressable onPress={() => zoom(0.5)} style={styles.zoomBtn} accessibilityLabel="Zoom in"><Plus size={20} color={gray[600]} /></Pressable>
              <View style={styles.zoomLine} />
              <Pressable onPress={() => zoom(2)} style={styles.zoomBtn} accessibilityLabel="Zoom out"><Minus size={20} color={gray[600]} /></Pressable>
            </View>
          </>
        )}
      </View>
      <View style={styles.coords}>
        <MapPin size={12} color={gray[400]} />
        <Text style={styles.coordsText}>{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: gray[200], backgroundColor: gray[100] },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  shadow: { position: 'absolute', top: '50%', left: '50%', width: 8, height: 4, marginLeft: -4, marginTop: -2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.2)' },
  hintWrap: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  hintText: { fontSize: 12, color: gray[600] },
  zoom: { position: 'absolute', right: 10, top: '50%', marginTop: -40, backgroundColor: '#fff', borderRadius: 2, elevation: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  zoomBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  zoomLine: { height: 1, backgroundColor: gray[200], marginHorizontal: 8 },
  coords: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: gray[50], borderTopWidth: 1, borderTopColor: gray[100] },
  coordsText: { fontSize: 11, color: gray[400], fontFamily: 'monospace' },
});
