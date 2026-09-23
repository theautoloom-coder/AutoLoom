/**
 * Payment proof screenshots: pick from gallery (or file on web), upload to the
 * private Supabase Storage bucket, and read back through short-lived signed
 * URLs. Uploading needs a connection; when offline the payment is still saved
 * and the proof can be attached later from the payment row.
 */
import { Platform } from 'react-native';

import { uuidv7 } from '@domain';

import { supabase } from './supabase';

export const PROOF_BUCKET = 'payment-proofs';

export type PickedFile = { uri: string; mimeType: string; name: string };

export async function pickProof(): Promise<PickedFile | null> {
  const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && Platform.OS !== 'web') return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', name: a.fileName ?? `proof-${Date.now()}.jpg` };
}

/** Upload and return the storage path to save on the payment row. */
export async function uploadProof(file: PickedFile, paymentId: string): Promise<string> {
  const ext = file.mimeType.includes('png') ? 'png' : file.mimeType.includes('webp') ? 'webp' : file.mimeType.includes('pdf') ? 'pdf' : 'jpg';
  const path = `${new Date().getFullYear()}/${paymentId}-${uuidv7().slice(-6)}.${ext}`;
  const body = await (await fetch(file.uri)).blob();
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, body, { contentType: file.mimeType, upsert: false });
  if (error) throw new Error(`Proof upload failed: ${error.message}`);
  return path;
}

/** Signed URL valid for an hour, for showing the screenshot. */
export async function proofUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
