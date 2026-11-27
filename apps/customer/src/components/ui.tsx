import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { tenant } from '@/config/tenant';
import { useColors } from '@/lib/theme';

export function PrimaryButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, { backgroundColor: tenant.primaryColor, opacity: off ? 0.5 : pressed ? 0.8 : 1 }]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, required, hint, ...input }: { label: string; required?: boolean; hint?: string } & ComponentProps<typeof TextInput>) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: c.muted }]}>
        {label}
        {required && <Text style={{ color: c.danger }}> *</Text>}
      </Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...input}
        style={[styles.input, { color: c.text, backgroundColor: c.field, borderColor: c.border }, input.style]}
      />
      {hint && <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text>}
    </View>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'warn' | 'ok'; children: string }) {
  const palette = {
    error: { bg: '#fdecea', fg: '#b71c1c' },
    warn: { bg: '#fff4e0', fg: '#8a5300' },
    ok: { bg: '#e7f6ec', fg: '#1a7f37' },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      <Text style={{ color: palette.fg, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17 },
  hint: { fontSize: 12 },
  notice: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
