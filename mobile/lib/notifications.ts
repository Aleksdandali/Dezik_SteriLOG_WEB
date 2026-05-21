import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permission + get Expo push token, then register it with backend.
 *
 * ⚠️ Backend gap: the endpoint `POST /api/telegram/staff/push-token` does not
 * exist yet — we just call it speculatively. Add it on the backend to persist
 * the token on `ops_staff.expo_push_token` (new column).
 */
export async function registerForPush(): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const tokenResp = await Notifications.getExpoPushTokenAsync();
  const token = tokenResp.data;

  try {
    await api('/api/telegram/staff/push-token', {
      method: 'POST',
      body: { expo_push_token: token, platform: Platform.OS },
    });
  } catch {
    // backend endpoint may not exist yet — non-fatal
  }

  return token;
}
