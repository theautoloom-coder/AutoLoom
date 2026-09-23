/**
 * Payment QR codes, shareable as a real image attachment.
 *
 * wa.me (see whatsapp.ts) can only prefill text — WhatsApp's own URL scheme
 * has no way to attach an image, so a QR can never ride along with the
 * prefilled reminder text in one tap. What we *can* do: hand the staff member
 * a real image file (a GIF, which every phone treats as a photo) through the
 * OS share sheet, so they pick the same WhatsApp chat and send it — then tap
 * "Remind" for the text. Two taps, but a real scannable attachment, no
 * server, no new account.
 *
 * qrcode-generator does the encoding *and* ships its own tiny built-in GIF
 * writer (dist/qrcode.js `createDataURL`), so this needs no image/canvas
 * library — it works identically on web, iOS and Android.
 */
import { Platform } from 'react-native';
import qrcode from 'qrcode-generator';

import { upiLink } from './whatsapp';

/** `data:image/gif;base64,...` for a QR encoding `data`. Pure JS, no canvas needed. */
export function qrDataUrl(data: string, cellSize = 8, margin = 16): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createDataURL(cellSize, margin);
}

/** The UPI pay-link QR for one collection — same link already sent as text in reminders. */
export function paymentQrDataUrl(args: { upiId: string; payee: string | null; amount?: number | null; note?: string }): string {
  return qrDataUrl(upiLink(args.upiId, args.payee, args.amount, args.note));
}

/** Share a `data:image/gif;base64,...` as a real image file via the OS share sheet. */
export async function shareImageDataUrl(dataUrl: string, opts: { dialogTitle?: string; fileName?: string } = {}): Promise<void> {
  const fileName = opts.fileName ?? 'payment-qr.gif';
  const base64 = dataUrl.split(',')[1] ?? '';

  if (Platform.OS === 'web') {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], fileName, { type: 'image/gif' });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: opts.dialogTitle });
      return;
    }
    // Desktop browsers rarely support sharing files: open it so the staff
    // member can save or drag it into WhatsApp Web themselves.
    window.open(dataUrl, '_blank');
    return;
  }

  const { File: ExpoFile, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  const file = new ExpoFile(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'image/gif', dialogTitle: opts.dialogTitle });
}
