import { formatMoney } from '@bakery/customer-core';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export const colors = {
  ink: '#2b2118',
  muted: '#6b5d52',
  accent: '#8a4b1f',
  line: '#e4d9cf',
  bg: '#fffaf5',
  error: '#a3261a',
  ok: '#2e6b3a',
};

export const money = (m: { cents: number; currency: string }) => formatMoney(m);

export function Button(props: {
  label: string;
  onPress: () => void;
  testID: string;
  kind?: 'primary' | 'plain';
  disabled?: boolean;
  compact?: boolean;
}) {
  const primary = props.kind !== 'plain';
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.button,
        primary ? styles.primary : styles.plain,
        props.compact && styles.compact,
        props.disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.buttonText, !primary && { color: colors.accent }, props.compact && { fontSize: 14 }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={styles.center} testID="loading">
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function Notice(props: { text: string; testID: string; tone?: 'error' | 'info'; children?: ReactNode }) {
  return (
    <View style={styles.notice} testID={props.testID}>
      <Text style={{ color: props.tone === 'info' ? colors.ink : colors.error, fontSize: 15 }}>{props.text}</Text>
      {props.children}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  text: { fontSize: 16, color: colors.ink },
  muted: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, backgroundColor: '#fff', gap: 4 },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  compact: { paddingVertical: 4, paddingHorizontal: 10, minHeight: 36 },
  primary: { backgroundColor: colors.accent },
  plain: { borderWidth: 1, borderColor: colors.accent, backgroundColor: '#fff' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  notice: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, backgroundColor: '#fff', gap: 8 },
});
