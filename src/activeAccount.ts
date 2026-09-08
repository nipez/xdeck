import type { XAccount } from "@shared/types";

const STORAGE_KEY = "xdeck.activeXAccountId";

export function readStoredActiveAccountId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredActiveAccountId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Resolve the active account from storage + connected list. */
export function resolveActiveAccount(
  accounts: XAccount[],
  storedId: string | null,
): XAccount | null {
  if (accounts.length === 0) return null;
  return accounts.find((a) => a.id === storedId) ?? accounts[0] ?? null;
}

/**
 * Rail-friendly handle: short names in full; longer names as @…last4
 * so truncation is obvious and the end of the handle stays recognizable.
 * Do not also apply CSS text-overflow on this string (double truncation).
 */
export function formatRailHandle(username: string, max = 6): string {
  if (username.length <= max) return `@${username}`;
  // U+2026 horizontal ellipsis — explicit truncation marker
  return `@\u2026${username.slice(-4)}`;
}
