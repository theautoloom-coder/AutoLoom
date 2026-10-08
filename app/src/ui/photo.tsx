/**
 * Showing and setting an item's photo.
 *
 * `ItemPhoto` is deliberately cheap: it takes a storage path straight from the
 * local database and builds the URL itself, so a list of thirty rows costs no
 * network calls and renders from disk cache when there is no signal. Where
 * there is no photo it draws a quiet placeholder rather than a broken box or a
 * gap that makes the list jump.
 */
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { deletePhotoFile, photoUrl, pickPhoto, uploadPhoto, type PickedPhoto } from '@/lib/photos';

import { Button, Row, Text, useTheme } from './index';
import { notify } from './forms';
import { radius, space } from './theme';

/** A thumbnail, or a placeholder carrying the item's first letter. */
export function ItemPhoto({
  path,
  localUri,
  name,
  size = 44,
}: {
  path?: string | null;
  /** A file picked on this device that has not been uploaded yet. */
  localUri?: string | null;
  name?: string | null;
  size?: number;
}) {
  const t = useTheme();
  const url = localUri || photoUrl(path);
  const box = {
    width: size,
    height: size,
    borderRadius: size > 80 ? radius.lg : radius.sm,
    backgroundColor: t.surfaceAlt,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (!url) {
    return (
      <View style={box}>
        <Text variant="label" color="textFaint">
          {(name ?? '?').trim().charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
    );
  }
  return (
    <View style={box}>
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size }}
        contentFit="cover"
        // Keep it on disk: the counter phone is offline half the day and a
        // photo it has already seen should still be there.
        cachePolicy="disk"
        transition={120}
      />
    </View>
  );
}

/**
 * Take, choose or remove the photo for one item.
 *
 * Uploading needs a connection. When there is none this says so rather than
 * appearing to succeed — a photo that vanishes is worse than one never taken.
 */
export function PhotoPicker({
  folder,
  path,
  localUri,
  name,
  onChange,
  onPickLocal,
  canEdit = true,
  hint,
}: {
  /** The line under the buttons, before a photo is chosen. */
  hint?: string;
  /**
   * Where the file is filed — the item's id. Not the name: names have spaces
   * and slashes. Absent while a brand new item is still being typed — it has
   * no id yet, so the photo waits with `onPickLocal` until save.
   */
  folder?: string | null;
  path?: string | null;
  /** A photo chosen but not yet uploaded, shown so it does not look ignored. */
  localUri?: string | null;
  name?: string | null;
  /** Called with the new storage path, or null when the photo is removed. */
  onChange?: (storagePath: string | null) => Promise<void> | void;
  /** Used instead of uploading when there is no variant id yet. */
  onPickLocal?: (photo: PickedPhoto | null) => void;
  canEdit?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function take(source: 'camera' | 'library') {
    setBusy(true);
    try {
      const picked = await pickPhoto(source);
      if (!picked) return;
      if (!folder) {
        // Nothing to attach it to yet. Hold it; the form uploads after save.
        onPickLocal?.(picked);
        return;
      }
      const stored = await uploadPhoto(picked, folder);
      await onChange?.(stored);
      notify('Photo lag gayi.', 'ok');
    } catch (e) {
      notify(`Photo upload nahi hui: ${String((e as Error).message ?? e)}. Net check karo.`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      if (!path) { onPickLocal?.(null); return; }
      await onChange?.(null);
      await deletePhotoFile(path).catch(() => {});
      notify('Photo hata di.', 'ok');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row gap={space.md} align="center">
      <ItemPhoto path={path} localUri={localUri} name={name} size={96} />
      {canEdit ? (
        <View style={{ flex: 1, gap: space.sm }}>
          {/* wrap, because at 412dp the 96px thumbnail plus both buttons is two
              pixels too wide and "Gallery se" hung off the right edge of the
              screen on Stock Chadhao and on the new-item form. */}
          <Row gap={space.sm} wrap>
            <Button title="Photo kheencho" size="sm" onPress={() => take('camera')} loading={busy} />
            <Button title="Gallery se" tone="secondary" size="sm" onPress={() => take('library')} />
          </Row>
          {path || localUri ? (
            <Pressable onPress={remove} disabled={busy}>
              <Text variant="small" color="danger">
                Photo hatao
              </Text>
            </Pressable>
          ) : (
            <Text variant="small" color="textFaint">
              {hint ?? 'Maal ki photo lagao — counter par dhoondhne mein aasani hoti hai.'}
            </Text>
          )}
        </View>
      ) : null}
    </Row>
  );
}
