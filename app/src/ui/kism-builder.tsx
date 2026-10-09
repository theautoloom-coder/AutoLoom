/**
 * Choose the kism of an item while writing stock in (owner, 8 Oct 2026).
 *
 * The item is already picked. Its kisms that exist are chips — tap one, give
 * the qty, done. Anything new (another car, another socket, another colour)
 * is chosen right here: the category's kism fields and the cars. If what was
 * chosen matches a kism that already exists, that one is used — the shelf
 * never ends up with two "Creta 2019–2023 · Black" that are the same thing.
 */
import { useQuery } from '@powersync/react';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatINR } from '@domain';

import { SELLABLE_QTY } from '@/lib/queries';
import type { ProposalFit, ProposalSpec } from '@/lib/requests';
import { variantNameOf } from '@/lib/requests';

import {
  CarPicker, SpecFields, badYears, buildSpecs, fitWithLabel, keyDefOf, kismSignature, toVal, useFamilySpecs, useModels,
  type SpecRow, type SpecVal,
} from './catalog-fields';
import { Button, Card, Chip, Row, Text } from './index';
import { NumberField, confirm, notify } from './forms';
import { space } from './theme';

export type PickedItem = {
  id: string; name: string; family_id: string | null; family: string | null;
  default_price: number | null; default_cost: number | null;
};

/** One line of a stock entry: an existing kism, or a new one to make on save. */
export type StockLine = {
  key: string;
  productId: string;
  productName: string;
  variantId: string | null;
  kismLabel: string;
  /** Set when the kism does not exist yet: made when the entry is saved. */
  newKism?: { specs: ProposalSpec[]; fits: ProposalFit[]; price: number | null; signature: string };
  qty: number;
  rate: number;
};

type Kism = { id: string; variant_name: string; retail_price: number; cost: number; qty: number };

export function KismBuilder({ item, showCost, pending, onAdd, onCancel, onAddCar }: {
  item: PickedItem;
  showCost: boolean;
  /** New kisms already on this entry, so a second line for the same one merges. */
  pending: StockLine[];
  onAdd: (line: StockLine) => void;
  onCancel: () => void;
  onAddCar?: (name: string) => Promise<string | null>;
}) {
  const { defs, optsByDef } = useFamilySpecs(item.family_id);
  const models = useModels();
  const axisDefs = useMemo(() => defs.filter((d) => d.is_variant_axis), [defs]);
  const keyDef = keyDefOf(defs);

  const { data: kisms, isLoading } = useQuery<Kism>(
    `SELECT pv.id, pv.variant_name, pv.retail_price, COALESCE(NULLIF(pv.last_purchase_cost, 0), pv.avg_cost, 0) AS cost,
            ${SELLABLE_QTY('pv')} AS qty
       FROM product_variants pv WHERE pv.product_id = ? AND pv.is_active = 1 ORDER BY pv.sort_order, pv.variant_name`, [item.id]);
  const { data: kismSpecs } = useQuery<{ variant_id: string; spec_definition_id: string; display_value: string }>(
    `SELECT variant_id, spec_definition_id, display_value FROM spec_values WHERE product_id = ? AND variant_id IS NOT NULL`, [item.id]);
  const { data: kismFits } = useQuery<{ variant_id: string | null; model_id: string; year_from: number | null; year_to: number | null }>(
    `SELECT variant_id, model_id, year_from, year_to FROM product_fitments WHERE product_id = ?`, [item.id]);

  // Each existing kism's identity, to recognise a "new" one that is not new.
  const signatures = useMemo(() => {
    const axis = new Set(axisDefs.map((d) => d.id));
    const itemFits = (kismFits ?? []).filter((f) => !f.variant_id);
    const m = new Map<string, string>();
    for (const k of kisms ?? []) {
      const specs = (kismSpecs ?? []).filter((s) => s.variant_id === k.id && axis.has(s.spec_definition_id))
        .map((s) => ({ def_id: s.spec_definition_id, display: s.display_value }));
      const own = (kismFits ?? []).filter((f) => f.variant_id === k.id);
      m.set(kismSignature(specs, own.length ? own : itemFits), k.id);
    }
    return m;
  }, [kisms, kismSpecs, kismFits, axisDefs]);

  const [chosen, setChosen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [vals, setVals] = useState<Record<string, SpecVal>>({});
  const [fits, setFits] = useState<ProposalFit[]>([]);
  const [qty, setQty] = useState<number | null>(1);
  const [rate, setRate] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);

  const existing = (kisms ?? []).find((k) => k.id === chosen) ?? null;
  // An item with no kism fields and no kisms yet gets its one plain kism.
  const plain = !isLoading && (kisms ?? []).length === 0 && axisDefs.length === 0;
  const newMode = making || plain || (!isLoading && (kisms ?? []).length === 0);

  // A new kism starts as the last one was (staff, 9 Oct 2026: "pehle jaisa hi
  // fill hua ho, bas mujhe change karna ho — bar bar sab cheez daalni padti
  // hai"). From the kism just added to this entry, else this item's newest
  // kism, else — for an item's first — the newest of its category. Only what
  // is different (usually the car) is then changed.
  const { data: lastRows, isLoading: lastLoading } = useQuery<SpecRow>(
    `SELECT sv.spec_definition_id, sv.variant_id, sv.option_id, sv.option_ids, sv.value_text, sv.value_number, sv.value_bool
       FROM spec_values sv
      WHERE sv.variant_id = (
        SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id
         WHERE pv.is_active = 1 AND (pv.product_id = ?1 OR p.family_id = ?2)
         ORDER BY CASE WHEN pv.product_id = ?1 THEN 0 ELSE 1 END, pv.created_at DESC LIMIT 1)`,
    [item.id, item.family_id ?? '']);
  const startFrom = useMemo(() => {
    const axis = new Set(axisDefs.map((d) => d.id));
    const out: Record<string, SpecVal> = {};
    const justAdded = [...pending].reverse().find((l) => l.productId === item.id && l.newKism)?.newKism;
    if (justAdded) {
      for (const sp of justAdded.specs) {
        if (!axis.has(sp.def_id)) continue;
        out[sp.def_id] = { option_id: sp.option_id ?? null, option_ids: sp.option_ids?.split(',').filter(Boolean), text: sp.text ?? undefined, number: sp.number ?? null, bool: sp.bool ?? null };
      }
      return out;
    }
    for (const r of lastRows ?? []) if (axis.has(r.spec_definition_id)) out[r.spec_definition_id] = toVal(r);
    return out;
  }, [axisDefs, pending, item.id, lastRows]);
  const [prefilled, setPrefilled] = useState(false);
  if (newMode && !plain && !prefilled && !lastLoading && axisDefs.length > 0 && Object.keys(vals).length === 0) {
    setPrefilled(true);
    if (Object.keys(startFrom).length > 0) setVals(startFrom);
  }
  const showPrefillNote = prefilled && Object.keys(startFrom).length > 0;

  // The cars this item's kisms already go on, one tap away — the same car in
  // another colour is not searched for again.
  const recentCars = useMemo(() => {
    const seen = new Set<string>();
    const out: ProposalFit[] = [];
    const add = (f: ProposalFit) => {
      const key = `${f.model_id}|${f.year_from ?? ''}|${f.year_to ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(fitWithLabel(f, models));
    };
    for (const l of [...pending].reverse()) if (l.productId === item.id) for (const f of l.newKism?.fits ?? []) add(f);
    for (const f of kismFits ?? []) add({ model_id: f.model_id, year_from: f.year_from, year_to: f.year_to });
    return out.slice(0, 8);
  }, [pending, item.id, kismFits, models]);
  const unpicked = recentCars.filter((c) => !fits.some((f) => f.model_id === c.model_id && f.year_from === c.year_from && f.year_to === c.year_to));

  async function add() {
    if (!qty || qty <= 0) { notify('Kitne aaye — qty likho.', 'danger'); return; }
    if (!newMode) {
      if (!existing) { notify('Kism chuno — ya “Nayi kism”.', 'danger'); return; }
      onAdd({
        key: `${existing.id}-${Date.now()}`, productId: item.id, productName: item.name, variantId: existing.id,
        kismLabel: existing.variant_name, qty, rate: showCost ? rate ?? existing.cost ?? 0 : 0,
      });
      return;
    }
    const specs = buildSpecs(axisDefs, optsByDef, vals);
    if (keyDef && !specs.some((s) => s.def_id === keyDef.id)) { notify(`${keyDef.name} chuno.`, 'danger'); return; }
    if (badYears(fits)) { notify('Gaadi ka “tak” wala saal “se” se pehle hai — theek karo.', 'danger'); return; }
    // Started from the last kism, the car is the thing most easily left as
    // it was. An item whose kisms go on cars gets asked before one goes on all.
    if (fits.length === 0 && recentCars.length > 0
      && !(await confirm('Gaadi nahi chuni', 'Ye kism har gaadi ki maani jayegi. Gaadi chunni hai to “Rehne do” dabao aur gaadi jodo.'))) return;
    const labelled = fits.map((f) => fitWithLabel(f, models));
    const signature = kismSignature(specs, labelled);
    const label = variantNameOf({ specs, fits: labelled });
    // Already on the shelf: use it, do not make a twin.
    const same = signatures.get(signature);
    if (same) {
      const k = (kisms ?? []).find((x) => x.id === same)!;
      notify(`Ye kism pehle se hai — “${k.variant_name}” mein jod diya.`, 'ok');
      onAdd({ key: `${k.id}-${Date.now()}`, productId: item.id, productName: item.name, variantId: k.id, kismLabel: k.variant_name, qty, rate: showCost ? rate ?? k.cost ?? 0 : 0 });
      return;
    }
    const twin = pending.find((l) => l.newKism?.signature === signature && l.productId === item.id);
    onAdd({
      key: twin?.key ?? `new-${Date.now()}`, productId: item.id, productName: item.name, variantId: null, kismLabel: label,
      newKism: { specs, fits: labelled, price: price ?? item.default_price ?? null, signature },
      qty, rate: showCost ? rate ?? item.default_cost ?? 0 : 0,
    });
  }

  return (
    <Card spine="accent" style={{ gap: space.md }}>
      <View>
        <Text variant="heading">{item.name}</Text>
        <Text variant="small" color="textMuted">{item.family ?? 'Bina category'}</Text>
      </View>

      {!isLoading && (kisms ?? []).length > 0 ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label" color="textMuted">Kaunsi kism aayi?</Text>
          <Row gap={space.xs} wrap>
            {(kisms ?? []).map((k) => (
              <Chip key={k.id} label={`${k.variant_name} · ${k.qty}`} selected={!making && chosen === k.id}
                onPress={() => { setMaking(false); setChosen(k.id); setRate(null); }} />
            ))}
            <Chip label="+ Nayi kism" selected={making} onPress={() => { setMaking(true); setChosen(null); }} />
          </Row>
        </View>
      ) : null}

      {newMode && !plain ? (
        <View style={{ gap: space.md }}>
          <Text variant="small" color="textMuted">
            {showPrefillNote
              ? 'Pichhli kism jaisi bhari hai — bas jo alag hai (gaadi, colour…) wahi badlo.'
              : (kisms ?? []).length ? 'Nayi kism — jo alag hai wo chuno.' : 'Is item ki pehli kism — detail aur gaadi chuno.'}
          </Text>
          <SpecFields defs={axisDefs} optsByDef={optsByDef} values={vals}
            onChange={(id, v) => setVals((p) => ({ ...p, [id]: v }))} required={keyDef ? new Set([keyDef.id]) : undefined} />
          <View style={{ gap: space.xs }}>
            <Text variant="label" color="textMuted">Kis gaadi mein lagta hai (zaroori nahi)</Text>
            <CarPicker fits={fits} onChange={setFits} models={models} onAddCar={onAddCar} />
            {unpicked.length > 0 ? (
              <View style={{ gap: space.xs }}>
                <Text variant="small" color="textFaint">Pichhli gaadiyan — tap karke jodo</Text>
                <Row gap={space.xs} wrap>
                  {unpicked.map((c) => (
                    <Chip key={`${c.model_id}-${c.year_from ?? ''}-${c.year_to ?? ''}`} label={`+ ${c.label || 'Gaadi'}`}
                      onPress={() => setFits((prev) => [...prev, c])} />
                  ))}
                </Row>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <Row gap={12} wrap>
        <View style={{ flex: 1, minWidth: 100 }}>
          <NumberField label="Kitne aaye" value={qty} onChange={setQty} decimals={0} />
        </View>
        {showCost ? (
          <View style={{ flex: 1, minWidth: 110 }}>
            <NumberField label="Kharid rate" value={rate} onChange={setRate}
              placeholder={existing ? String(existing.cost || '') : item.default_cost ? String(item.default_cost) : ''}
              hint="Zaroori nahi" />
          </View>
        ) : null}
        {showCost && newMode ? (
          <View style={{ flex: 1, minWidth: 110 }}>
            <NumberField label="Bechne ka rate" value={price} onChange={setPrice}
              placeholder={item.default_price ? String(item.default_price) : ''} hint="Nayi kism ka" />
          </View>
        ) : null}
      </Row>
      {existing && showCost && existing.cost ? <Text variant="small" color="textFaint">Pichhli baar {formatINR(existing.cost)}</Text> : null}

      <Row gap={space.sm}>
        <Button title="Line jodo" onPress={add} style={{ flex: 1 }} />
        <Button title="Rehne do" tone="ghost" onPress={onCancel} />
      </Row>
    </Card>
  );
}
