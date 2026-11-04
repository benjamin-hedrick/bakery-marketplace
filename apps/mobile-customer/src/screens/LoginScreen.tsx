import { useState } from 'react';
import { Text, View } from 'react-native';
import { signIn } from '../auth/session';
import { Button, Notice, styles } from '../ui';

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await signIn();
      if (result === 'failed') setProblem('Sign-in did not finish. Please try again.');
    } catch {
      setProblem('Sign-in did not finish. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.center} testID="login-screen">
      <Text style={styles.title}>Bakery Marketplace</Text>
      <Text style={styles.muted}>Order ahead and pick up fresh.</Text>
      {problem ? <Notice text={problem} testID="login-problem" /> : null}
      <Button label={busy ? 'Opening sign-in…' : 'Sign in'} onPress={login} testID="login-button" disabled={busy} />
    </View>
  );
}
