// Message text with any http(s) address turned into a tappable link (web
// LinkText) — so a location pin sent as a Google Maps link opens Maps. The last
// character may not be punctuation, so "…/page, thanks" keeps the comma out.
import { Linking, Text } from 'react-native';

const URL_RE = /(https?:\/\/[^\s<>"']*[^\s<>"'.,!?;:)\]])/g;

export function LinkText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <Text key={i} style={{ textDecorationLine: 'underline' }} onPress={() => { void Linking.openURL(p).catch(() => {}); }}>{p}</Text>
        : p ? <Text key={i}>{p}</Text> : null))}
    </>
  );
}
