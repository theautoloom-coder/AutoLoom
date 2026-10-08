/**
 * Item photos: take one at the shelf, or pick one, and put it on the item.
 *
 * A shop that stocks forty kinds of black floor mat cannot work from SKUs
 * alone. The counter hand needs to see which one the customer is pointing at,
 * and the person receiving stock needs to know the box in their hands is the
 * one on the screen.
 *
 * Three things make this behave on a shop counter rather than in a demo:
 *
 *   · Resized before upload. A phone camera hands back 3-5 MB. At this shop's
 *     distance from the server that is half a minute of waiting per photo, and
 *     a catalogue of hundreds of them nobody can afford to load. 1280px on the
 *     long edge is more than a thumbnail ever needs and lands around 150 KB.
 *   · The bucket is public, so the URL is stable, so expo-image keeps the file
 *     on disk. A photo seen once is there tomorrow with no signal.
 *   · The row and the file are separate. PowerSync carries the row offline;
 *     the bytes need a connection. So a photo taken offline cannot be saved —
 *     and this says so plainly instead of appearing to work and losing it.
 */
import { Platform } from 'react-native';

import { uuidv7 } from '@domain';

import { supabase } from './supabase';

export const PHOTO_BUCKET = 'item-photos';

/** Long edge, in pixels, after resizing. */
const MAX_EDGE = 1280;

export type PickedPhoto = { uri: string; width: number; height: number };

type Source = 'camera' | 'library';

/**
 * Take a photo or choose one. Returns null when the person backs out or
 * refuses permission — both are ordinary, neither is an error.
 */
export async function pickPhoto(source: Source): Promise<PickedPhoto | null> {
  const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');

  if (source === 'camera') {
    // The web has no camera roll to fall back on, so a browser always picks.
    if (Platform.OS === 'web') return pickPhoto('library');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return null;
    return shrink(res.assets[0].uri);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && Platform.OS !== 'web') return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return shrink(res.assets[0].uri);
}

/** Down to a sane size before it ever touches the network. */
async function shrink(uri: string): Promise<PickedPhoto> {
  try {
    const IM = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const out = await IM.manipulateAsync(uri, [{ resize: { width: MAX_EDGE } }], {
      compress: 0.7,
      format: IM.SaveFormat.JPEG,
    });
    return { uri: out.uri, width: out.width, height: out.height };
  } catch {
    // Resizing is an optimisation, not a requirement. A big photo beats none.
    return { uri, width: 0, height: 0 };
  }
}

/**
 * The photo's bytes, as something supabase-js can send.
 *
 * On a phone `fetch(file://…).blob()` hands back a Blob that React Native
 * cannot turn into a request body, so the upload carried nothing and every
 * photo taken on the APK was lost (8 Oct 2026: not one file had ever reached
 * storage). The file is read through expo-file-system instead, as an
 * ArrayBuffer — what the Supabase guide for React Native uploads uses. The
 * browser's own blob is fine as it is.
 */
async function bytesOf(uri: string): Promise<ArrayBuffer | Blob> {
  if (Platform.OS === 'web') return (await fetch(uri)).blob();
  try {
    const { File } = require('expo-file-system') as typeof import('expo-file-system');
    return await new File(uri).arrayBuffer();
  } catch {
    // Some gallery apps hand back a uri the new API will not open; the
    // older one reads it as base64, which is turned back into bytes here.
    const legacy = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const b64 = await legacy.readAsStringAsync(uri, { encoding: legacy.EncodingType.Base64 });
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
}

/**
 * Upload the bytes and return the storage path to record on the row.
 * `folder` is only where the file is filed — the item's id, or 'bills'.
 * Throws when offline — the caller must say so rather than pretend.
 */
export async function uploadPhoto(photo: PickedPhoto, folder: string): Promise<string> {
  const path = `${folder}/${uuidv7().slice(-8)}.jpg`;
  const body = await bytesOf(photo.uri);
  const size = body instanceof ArrayBuffer ? body.byteLength : body.size;
  if (!size) throw new Error('photo khaali nikli — dobara lo');
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * The public URL for a stored photo.
 *
 * Built from the project URL rather than fetched, so a list of thirty items
 * costs nothing and works from the local database with no network at all —
 * expo-image then serves whatever it already has on disk.
 */
export function photoUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl || null;
}

/** Remove the file. The row is deleted separately, through PowerSync. */
export async function deletePhotoFile(storagePath: string): Promise<void> {
  await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
}
