// Several photos from the library at once (the web picker takes many), each
// compressed like lib/extras pickPhoto: long side capped at 1600 px, JPEG 0.8.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { pickPhoto } from '@/lib/extras';

export type PickedPhoto = { uri: string; name: string };

/** Most photos sent in one go. */
export const MAX_CHAT_PHOTOS = 10;

export async function pickPhotos(source: 'camera' | 'library'): Promise<PickedPhoto[]> {
  if (source === 'camera') {
    const one = await pickPhoto('camera');
    return one ? [one] : [];
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo access was not given.');
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: MAX_CHAT_PHOTOS, orderedSelection: true,
  });
  if (r.canceled || !r.assets?.length) return [];
  const out: PickedPhoto[] = [];
  for (const [i, a] of r.assets.entries()) {
    const long = Math.max(a.width || 0, a.height || 0);
    const ctx = ImageManipulator.manipulate(a.uri);
    if (long > 1600) ctx.resize(a.width >= a.height ? { width: 1600 } : { height: 1600 });
    const img = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    out.push({ uri: img.uri, name: `photo-${Date.now()}-${i + 1}.jpg` });
  }
  return out;
}
