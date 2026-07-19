// Local backup history: timestamped JSON snapshots of the whole persisted
// state, kept in the app's documents folder (survives reinstalls via iOS
// backups, unlike the cache the share-export writes through). One automatic
// backup per day when the app has data, plus manual ones on demand; the list
// is pruned so the history never grows past a screenful.

import { Directory, File, Paths } from "expo-file-system";

import { parsePersistedState, type PersistedState } from "./storage";

export interface BackupEntry {
  /** File name — the stable id for restore/share/delete. */
  name: string;
  /** When it was written (local time). */
  createdAt: Date;
  /** True for the daily automatic snapshot. */
  auto: boolean;
  itemCount: number;
  accountCount: number;
  uri: string;
}

const KEEP = 10;

function backupsDir(): Directory {
  const dir = new Directory(Paths.document, "backups");
  if (!dir.exists) dir.create();
  return dir;
}

// keel-auto-2026-07-11T16-21-05.json / keel-manual-....json
function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function parseName(name: string): { createdAt: Date; auto: boolean } | null {
  const match = /^keel-(auto|manual)-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.json$/.exec(
    name,
  );
  if (!match) return null;
  const [, kind, y, m, d, hh, mm, ss] = match;
  return {
    auto: kind === "auto",
    createdAt: new Date(+y, +m - 1, +d, +hh, +mm, +ss),
  };
}

/** The cheap listing: everything the filename alone can say, newest first.
 *  No file is opened or parsed — safe on the launch path. */
export function listBackupStamps(): { name: string; createdAt: Date; auto: boolean }[] {
  try {
    const stamps: { name: string; createdAt: Date; auto: boolean }[] = [];
    for (const child of backupsDir().list()) {
      if (!(child instanceof File)) continue;
      const meta = parseName(child.name);
      if (!meta) continue;
      stamps.push({ name: child.name, createdAt: meta.createdAt, auto: meta.auto });
    }
    return stamps.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

/** All backups WITH their contents summarized, newest first. Reads and
 *  parses every file, so keep it to user-opened screens; the launch path
 *  uses listBackupStamps. Unreadable files are skipped, not fatal. */
export function listBackups(): BackupEntry[] {
  try {
    const entries: BackupEntry[] = [];
    for (const child of backupsDir().list()) {
      if (!(child instanceof File)) continue;
      const meta = parseName(child.name);
      if (!meta) continue;
      const state = parsePersistedState(child.textSync());
      if (!state) continue;
      entries.push({
        name: child.name,
        createdAt: meta.createdAt,
        auto: meta.auto,
        itemCount: state.items.length,
        accountCount: state.accounts.length,
        uri: child.uri,
      });
    }
    return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

function prune(): void {
  const extra = listBackupStamps().slice(KEEP);
  for (const entry of extra) deleteBackup(entry.name);
}

/** Write a snapshot now; returns false when writing failed. */
export function createBackup(state: PersistedState, auto = false): boolean {
  try {
    const file = new File(
      backupsDir(),
      `keel-${auto ? "auto" : "manual"}-${stamp(new Date())}.json`,
    );
    file.create();
    file.write(JSON.stringify(state));
    prune();
    return true;
  } catch {
    return false;
  }
}

/** The daily safety net: at most one automatic backup per calendar day, and
 *  only when there is something worth keeping. Filename stamps only: this
 *  runs at launch and must not parse backup files. */
export function autoBackupIfDue(state: PersistedState): void {
  if (state.items.length === 0 && state.accounts.length === 0) return;
  const newestAuto = listBackupStamps().find((entry) => entry.auto);
  if (newestAuto && newestAuto.createdAt.toDateString() === new Date().toDateString()) return;
  createBackup(state, true);
}

/** The backup's raw JSON, ready for importData; null when unreadable. */
export function readBackup(name: string): string | null {
  try {
    return new File(backupsDir(), name).textSync();
  } catch {
    return null;
  }
}

export function deleteBackup(name: string): void {
  try {
    const file = new File(backupsDir(), name);
    if (file.exists) file.delete();
  } catch {
    // Already gone is fine.
  }
}

export function deleteAllBackups(): void {
  for (const entry of listBackups()) deleteBackup(entry.name);
}
