// Emoji picker under the composer (web chat/EmojiPicker, trimmed): a row of
// category tabs, then a scrolling grid. Recently used ones come first.
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { cw } from '@/components/chatUi';

const STARTER = ['👍', '🙏', '😊', '😂', '❤️', '👌', '✅', '🙌', '😅', '🤝', '📍', '🚗', '🧹', '✨', '🏠', '⏰'];

const CATS: { key: string; icon: string; list: string[] }[] = [
  { key: 'recent', icon: '🕘', list: [] },
  { key: 'smileys', icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 👋 🤚 ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 👏 🙌 👐 🤲 🤝 🙏 💪 🙋 🙆 🙅 🤷 🤦 💁'.split(' ') },
  { key: 'hearts', icon: '❤️', list: '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 ✅ ☑️ ✔️ ❌ ❎ ⭕ ❗ ❓ ⚠️ 🔥 ✨ 🌟 ⭐ 💫 🎉 🎊 🎁 🏆 🥇 👀 💬 💭 🕐 ⏰ ⏳ 📅 📆'.split(' ') },
  { key: 'nature', icon: '🐻', list: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🐝 🐛 🦋 🐌 🐞 🐜 🦟 🕷️ 🐢 🐍 🐙 🐠 🐟 🐬 🐳 🌵 🎄 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🍂 🌷 🌹 🌺 🌸 🌼 🌻 🌞 🌝 🌙 ⭐ ☀️ ⛅ ☁️ 🌧️ ⛈️ 🌈 ❄️ 💧 🌊'.split(' ') },
  { key: 'food', icon: '🍔', list: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🥔 🍞 🥐 🧀 🥚 🍳 🥞 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍡 🍦 🍰 🎂 🍮 🍭 🍬 🍫 🍩 🍪 ☕ 🍵 🧋 🥤 🍺 🍷'.split(' ') },
  { key: 'travel', icon: '🚗', list: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🚨 🚦 🚧 ⛽ 🛣️ 🗺️ 📍 📌 🏠 🏡 🏢 🏬 🏥 🏦 🏨 🏪 🏫 🏛️ ⛪ 🕌 🏗️ 🏘️ ✈️ 🚀 🚁 ⛵ 🚢 ⚓ 🗼 🌉 🎡 🏖️ 🏝️ ⛰️ 🏕️'.split(' ') },
  { key: 'objects', icon: '💡', list: '🧹 🧺 🧻 🧼 🧽 🪣 🧴 🧯 🪠 🚿 🛁 🚽 🧸 🛋️ 🛏️ 🪑 🚪 🪟 🔑 🗝️ 🔒 🔓 🔨 🪛 🔧 🔩 ⚙️ 🧰 🪜 💡 🔦 🕯️ 🔌 🔋 📱 💻 🖥️ ⌚ 📷 📸 📞 ☎️ 📺 📻 🧾 💳 💵 💰 🪙 📦 📫 ✉️ 📧 📝 ✏️ 🖊️ 📎 📏 📐 ✂️ 🗑️ 🧪 🌡️ 💊 🩹 🧷 🎈'.split(' ') },
];

/** Recently used, kept while the app runs. */
let recentlyUsed = STARTER;
function remember(e: string) {
  recentlyUsed = [e, ...recentlyUsed.filter(x => x !== e)].slice(0, 24);
  return recentlyUsed;
}

export function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  const [cat, setCat] = useState('recent');
  const [recent, setRecent] = useState(() => recentlyUsed);
  const list = useMemo(() => (cat === 'recent' ? recent : CATS.find(c => c.key === cat)?.list ?? []), [cat, recent]);
  const pick = (e: string) => {
    const next = remember(e);
    if (cat !== 'recent') setRecent(next);
    onPick(e);
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {CATS.map(c => (
          <Pressable key={c.key} onPress={() => setCat(c.key)} style={[styles.tab, cat === c.key && styles.tabOn]}>
            <Text style={styles.tabIcon}>{c.icon}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        key={cat}
        data={list}
        numColumns={8}
        keyExtractor={(e, i) => `${i}-${e}`}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={styles.cell}>
            <Text style={styles.emoji}>{item}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 280, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: cw.line },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: cw.line },
  tab: { width: 38, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: cw.chip },
  tabIcon: { fontSize: 18 },
  cell: { flex: 1 / 8, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
});
