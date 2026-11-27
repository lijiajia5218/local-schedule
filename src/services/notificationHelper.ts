import { isTauriRuntime } from '@/services/scheduleApi';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isTauriRuntime()) {
    return 'unsupported';
  }
  try {
    const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
    const granted = await isPermissionGranted();
    return granted ? 'granted' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isTauriRuntime()) {
    return 'unsupported';
  }
  try {
    const { isPermissionGranted, requestPermission } = await import(
      '@tauri-apps/plugin-notification'
    );
    if (await isPermissionGranted()) {
      return 'granted';
    }
    const result = await requestPermission();
    if (result === 'granted') return 'granted';
    if (result === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}
