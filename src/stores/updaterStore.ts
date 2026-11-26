import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { isTauriRuntime } from '@/services/scheduleApi';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'error'
  | 'unsupported';

export const useUpdaterStore = defineStore('updater', () => {
  const currentVersion = ref('0.4.0');
  const status = ref<UpdaterStatus>('idle');
  const availableVersion = ref<string | null>(null);
  const releaseNotes = ref('');
  const downloadProgress = ref<number | null>(null);
  const errorMessage = ref('');

  let pendingUpdate: Update | null = null;
  let versionLoaded = false;

  async function ensureCurrentVersion(): Promise<void> {
    if (versionLoaded || !isTauriRuntime()) return;
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      currentVersion.value = await getVersion();
      versionLoaded = true;
    } catch {
      // keep default version fallback
    }
  }

  async function releasePendingUpdate(): Promise<void> {
    if (pendingUpdate) {
      await pendingUpdate.close().catch(() => {});
      pendingUpdate = null;
    }
  }

  async function checkForUpdates(options: { silent?: boolean } = {}): Promise<void> {
    const silent = options.silent ?? false;

    if (!isTauriRuntime()) {
      if (!silent) {
        status.value = 'unsupported';
      }
      return;
    }

    if (status.value === 'checking' || status.value === 'downloading') return;

    await ensureCurrentVersion();
    status.value = 'checking';
    errorMessage.value = '';

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: 15000 });

      await releasePendingUpdate();

      if (update) {
        pendingUpdate = update;
        availableVersion.value = update.version;
        releaseNotes.value = update.body ?? '';
        status.value = 'available';
      } else {
        availableVersion.value = null;
        releaseNotes.value = '';
        status.value = 'up-to-date';
      }
    } catch (err) {
      if (silent) {
        status.value = 'idle';
        return;
      }
      status.value = 'error';
      errorMessage.value = err instanceof Error ? err.message : '检查更新失败，请检查网络后重试';
    }
  }

  async function downloadAndInstallUpdate(): Promise<void> {
    if (!isTauriRuntime() || !pendingUpdate || status.value === 'downloading') return;

    status.value = 'downloading';
    downloadProgress.value = 0;
    errorMessage.value = '';

    let contentLength = 0;
    let downloaded = 0;

    try {
      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
          downloaded = 0;
          downloadProgress.value = contentLength > 0 ? 0 : null;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            downloadProgress.value = Math.min(100, Math.round((downloaded / contentLength) * 100));
          }
        } else if (event.event === 'Finished') {
          downloadProgress.value = 100;
        }
      });

      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      status.value = 'error';
      downloadProgress.value = null;
      errorMessage.value = err instanceof Error ? err.message : '下载或安装更新失败';
    }
  }

  return {
    currentVersion,
    status,
    availableVersion,
    releaseNotes,
    downloadProgress,
    errorMessage,
    ensureCurrentVersion,
    checkForUpdates,
    downloadAndInstallUpdate,
  };
});
