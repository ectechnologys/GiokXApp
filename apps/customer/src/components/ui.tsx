// Buttons, fields and notices in the web portal's style.
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { accent, gray } from '@/lib/theme';

/** Filled button in the website accent (or `color`). */
export function PrimaryButton({ label, onPress, busy, disabled, color = accent, icon }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; color?: string; icon?: ReactNode;
}) {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, { backgroundColor: color, shadowColor: color, opacity: off ? 0.45 : pressed ? 0.85 : 1 }]}>
      {busy ? <ActivityIndicator color="#fff" /> : (
        <>
          {icon}
          <Text style={styles.btnText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** ring-1 ring-gray-200 bg-white button. */
export function SecondaryButton({ label, onPress, disabled, color = gray[700] }: { label: string; onPress: () => void; disabled?: boolean; color?: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.btn2, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
      <Text style={[styles.btn2Text, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Label + input (web LabelledInput: text-xs font-semibold text-gray-600, rounded-xl border-gray-200). */
export function Field({ label, required, hint, ...input }: { label: string; required?: boolean; hint?: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: '#ef4444' }}> *</Text>}
      </Text>
      <TextInput placeholderTextColor={gray[400]} {...input} style={[styles.input, input.style]} />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

/** Coloured message box (web: rounded-xl px-3 py-2.5 text-xs ring-1). */
export function Notice({ tone, children }: { tone: 'error' | 'warn' | 'ok'; children: string }) {
  const p = {
    error: { bg: '#fef2f2', ring: '#fee2e2', fg: '#b91c1c' },
    warn: { bg: '#fffbeb', ring: '#fde68a', fg: '#92400e' },
    ok: { bg: '#ecfdf5', ring: '#d1fae5', fg: '#047857' },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: p.bg, borderColor: p.ring }]}>
      <Text style={{ color: p.fg, fontSize: 14, lineHeight: 20, fontWeight: '500' }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', gap: 8, borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4,
    shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btn2: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: gray[200], backgroundColor: '#fff' },
  btn2Text: { fontSize: 15, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: gray[600] },
  input: { borderWidth: 1, borderColor: gray[200], backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: gray[900] },
  hint: { fontSize: 11, color: gray[400] },
  notice: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
});
