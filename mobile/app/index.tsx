import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { getToken } from '@/lib/auth';

export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getToken().then(t => setAuthed(!!t));
  }, []);

  if (authed === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={authed ? '/(tabs)/create' : '/(auth)/login'} />;
}
