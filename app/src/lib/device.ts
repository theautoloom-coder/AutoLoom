/**
 * Device identity.
 *
 * Every row a device writes carries its device_id so the audit trail says
 * which phone or PC did what, and so numbering series can be owned by one
 * device. The id is minted once and kept in local storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { uuidv7 } from '@domain';

const KEY = 'autoloom.device_id';
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await AsyncStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // storage unavailable (private window etc.) — fall through to a fresh id
  }
  const id = uuidv7();
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, id);
    else await AsyncStorage.setItem(KEY, id);
  } catch {
    // ignore
  }
  cached = id;
  return id;
}

export function devicePlatform(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'web';
}

export function defaultDeviceName(): string {
  if (Platform.OS === 'web') {
    const ua = globalThis.navigator?.userAgent ?? '';
    const os = /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android browser' : 'Browser';
    return os;
  }
  return Platform.OS === 'ios' ? 'iPhone' : 'Android phone';
}
