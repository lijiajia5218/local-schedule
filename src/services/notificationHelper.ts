import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '@/services/scheduleApi';

export type NotificationPermissionStatus = 'desktop-managed' | 'unsupported';

/**
 * On desktop targets (macOS/Windows), `tauri-plugin-notification` does not inspect the OS
 * notification center switch directly (its desktop implementation stubs permission checks to
 * Granted). Report `'desktop-managed'` honestly so the UI guides users to verify OS settings
 * and offers an explicit test-notification trigger rather than falsely claiming "已授权".
 */
export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isTauriRuntime()) {
    return 'unsupported';
  }
  return 'desktop-managed';
}

export async function sendTestDesktopNotification(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke<void>('send_test_notification');
}
