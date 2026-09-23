/**
 * Line-item picking shared by purchases, transfers, adjustments, audits and
 * invoices: a search box (typing or a USB/Bluetooth scanner that types the
 * barcode and presses Enter), a camera scanner on phones, and the result list.
 */
import { useQuery } from '@powersync/react';
import React, { useMemo, useRef, useState } from 'react';
import { Modal, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatINR } from '@domain';

import { SEARCH_VARIANTS, tokenize } from '@/lib/queries';
import { Badge, Button, Divider, Empty, IconButton, Input, ListRow, Row, Text, useTheme } from './index';
import { radius, shadow, space } from './theme';

export type PickedVariant = {
  id: string; sku: string; barcode: string | null; variant_name: string; product_id: string; product_name: string; brand_name: string | null; family_name: string | null;
  retail_price: number; dealer_price: number | null; wholesale_price: number | null; mrp: number | null; avg_cost: number; last_purchase_cost: number; qty: number;
  hsn_code?: string | null; tax_rate_pct?: number | null; unit_code?: string | null; min_selling_price?: number | null;
};

const PICK_SQL = (tokens: string[]) => {
  const base = SEARCH_VARIANTS(tokens, 30);
  return {
    sql: base.sql.replace(
      'FROM product_variants pv',
      `, p.hsn_code, tr.rate_pct AS tax_rate_pct, u.code AS unit_code, pv.min_selling_price
       FROM product_variants pv`
    ).replace('LEFT JOIN product_families f ON f.id = p.family_id', 'LEFT JOIN product_families f ON f.id = p.family_id LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id LEFT JOIN units u ON u.id = p.unit_id'),
    params: base.params,
  };
};

/**
 * Search + pick. `onPick` fires with the variant; the search stays open for the
 * next item.
 *
 * `onCreate` is what happens when the item is on the shelf but not in the
 * catalogue — new stock, a line the shop just started carrying. Without it the
 * empty state said "No matching SKU" and offered nothing, so the only way
 * forward was to abandon the bill with the customer standing there. The
 * document is a draft and survives, so making the item and coming back is safe.
 */
export function VariantPicker({ onPick, onCreate, canCreate, showCost, showPrice, locationId, autoFocus = true }: { onPick: (v: PickedVariant) => void; onCreate?: (text: string) => void; canCreate?: boolean; showCost?: boolean; showPrice?: boolean; locationId?: string | null; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<TextInput>(null);
  const tokens = useMemo(() => tokenize(q), [q]);
  const pq = PICK_SQL(tokens.length ? tokens : [' ']);
  const { data: hits } = useQuery<PickedVariant>(pq.sql, pq.params);
  const { data: locQty } = useQuery<{ variant_id: string; qty: number }>(
    'SELECT variant_id, qty FROM stock_on_hand WHERE location_id = ?', [locationId ?? '']);
  const locMap = useMemo(() => new Map((locQty ?? []).map((l) => [l.variant_id, l.qty])), [locQty]);

  function submit() {
    // A scanner types the barcode and presses Enter: pick the exact match at once.
    const exact = (hits ?? []).find((h) => h.barcode === q.trim() || h.sku.toLowerCase() === q.trim().toLowerCase());
    if (exact) {
      onPick(exact);
      setQ('');
      inputRef.current?.focus();
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        <Input
          ref={inputRef}
          containerStyle={{ flex: 1 }}
          value={q}
          onChangeText={setQ}
          placeholder="Scan barcode or type SKU / name / socket"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          blurOnSubmit={false}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        {Platform.OS !== 'web' ? <ScanButton onScanned={(code) => { setQ(code); setTimeout(submit, 50); }} /> : null}
      </Row>
      {tokens.length > 0 ? (
        <View>
          {(hits ?? []).map((h) => (
            <ListRow
              key={h.id}
              title={`${h.product_name} · ${h.variant_name}`}
              subtitle={
                <Row gap={space.xs} wrap>
                  <Text variant="small" color="textMuted" mono>{h.sku}</Text>
                  {h.family_name ? <Badge>{h.family_name}</Badge> : null}
                </Row>
              }
              onPress={() => { onPick(h); setQ(''); inputRef.current?.focus(); }}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text mono color={h.qty <= 0 ? 'danger' : 'ok'}>{locationId ? `${locMap.get(h.id) ?? 0} here` : `${h.qty}`}</Text>
                  {showCost ? <Text variant="small" color="textMuted" mono>cost {formatINR(h.avg_cost || h.last_purchase_cost)}</Text> : showPrice ? <Text variant="small" color="textMuted" mono>{formatINR(h.dealer_price ?? h.retail_price)}</Text> : null}
                </View>
              }
            />
          ))}
          {(hits ?? []).length === 0 ? (
            onCreate && q.trim() ? (
              <View style={{ gap: 8, paddingVertical: 8 }}>
                <Empty title={`"${q.trim()}" nahi mila`} />
                {canCreate ? (
                  <Button
                    title={`+ "${q.trim()}" naya item banao`}
                    onPress={() => onCreate(q.trim())}
                  />
                ) : (
                  <Text variant="small" color="textMuted">
                    Ye item catalogue mein nahi hai. Admin ko bhejo — approve hote hi bill mein laga sakoge.
                  </Text>
                )}
              </View>
            ) : (
              <Empty title="No matching SKU" />
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Camera barcode scanner (native only). Loaded lazily so web never imports expo-camera. */
export function ScanButton({ onScanned }: { onScanned: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const t = useTheme();
  return (
    <>
      <Button title="Scan" tone="secondary" onPress={() => setOpen(true)} />
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          {open ? <CameraScanner onScanned={(c) => { setOpen(false); onScanned(c); }} onClose={() => setOpen(false)} /> : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function CameraScanner({ onScanned, onClose }: { onScanned: (code: string) => void; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Camera = require('expo-camera') as typeof import('expo-camera');
  const [permission, requestPermission] = Camera.useCameraPermissions();
  const [locked, setLocked] = useState(false);

  if (!permission) return <Empty title="Preparing camera…" />;
  if (!permission.granted) {
    return (
      <View style={{ padding: space.xl, gap: space.md }}>
        <Text>AutoLoom needs the camera to scan barcodes.</Text>
        <Button title="Allow camera" onPress={requestPermission} />
        <Button title="Cancel" tone="ghost" onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Camera.CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'qr'] }}
        onBarcodeScanned={({ data }) => {
          if (locked) return;
          setLocked(true);
          onScanned(data);
        }}
      />
      <View style={{ padding: space.lg }}>
        <Button title="Cancel" tone="secondary" onPress={onClose} />
      </View>
    </View>
  );
}

/** A document line as shown on the editing screens. */
export function LineCard({ title, subtitle, children, onRemove, right }: { title: string; subtitle?: string; children?: React.ReactNode; onRemove?: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[shadow.xs, { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: space.md, gap: space.sm, backgroundColor: t.surface }]}>
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <View style={{ flex: 1 }}>
          <Text variant="heading">{title}</Text>
          {subtitle ? <Text variant="small" color="textMuted" mono>{subtitle}</Text> : null}
        </View>
        {right}
        {onRemove ? <IconButton icon={<Text color="danger">×</Text>} tone="danger" size={32} onPress={onRemove} accessibilityLabel="Remove line" /> : null}
      </Row>
      {children ? <><Divider />{children}</> : null}
    </View>
  );
}
