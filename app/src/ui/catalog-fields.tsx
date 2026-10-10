/**
 * The pieces every catalogue screen shares (owner, 8 Oct 2026): the
 * category's own detail fields, and the cars a kism goes on.
 *
 * One implementation, used by the item master, the kism form and Stock
 * Chadhao — so a socket chosen while writing stock in is stored exactly as one
 * chosen in the catalogue, and the same kism is recognised whichever way it
 * was made.
 *
 * The fields come from the database (spec_definitions / spec_options per
 * category), so a new detail or a new option is added from Category settings,
 * not by a new app.
 */
import { useQuery } from '@powersync/react';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { slug } from '@domain';

import type { ProposalFit, ProposalSpec } from '@/lib/requests';
import { useSession } from '@/lib/session';
import { useSystem } from '@/lib/system';
import { insertRow } from '@/lib/writes';

import { Button, Chip, Input, Row, Text } from './index';
import { NumberField, SelectField } from './forms';
import { space } from './theme';

export type Def = {
  id: string; code: string; name: string; data_type: string; unit: string | null;
  is_required: number; is_variant_axis: number; show_in_variant_name: number; sort_order: number;
};
export type Opt = { id: string; spec_definition_id: string; value: string };
/** What someone has put in one detail box. */
export type SpecVal = { option_id?: string | null; option_ids?: string[]; text?: string; number?: number | null; bool?: boolean | null };
export type SpecRow = { spec_definition_id: string; variant_id: string | null; option_id: string | null; option_ids: string | null; value_text: string | null; value_number: number | null; value_bool: number | null };

export const yearsLabel = (f: { year_from?: number | null; year_to?: number | null }) =>
  f.year_from ? ` ${f.year_from}${f.year_to ? (f.year_to === f.year_from ? '' : `–${f.year_to}`) : '+'}` : '';

export const toVal = (r: SpecRow): SpecVal => ({
  option_id: r.option_id, option_ids: r.option_ids ? r.option_ids.split(',').filter(Boolean) : undefined,
  text: r.value_text ?? undefined, number: r.value_number, bool: r.value_bool == null ? null : !!r.value_bool,
});

/** Two spec values that say the same thing, however they were stored. */
export const sameVal = (a?: SpecVal, b?: SpecVal) =>
  JSON.stringify([a?.option_id ?? null, [...(a?.option_ids ?? [])].sort(), (a?.text ?? '').trim(), a?.number ?? null, a?.bool ?? null])
  === JSON.stringify([b?.option_id ?? null, [...(b?.option_ids ?? [])].sort(), (b?.text ?? '').trim(), b?.number ?? null, b?.bool ?? null]);

/** A category's detail fields and their options, live from the database. */
export function useFamilySpecs(familyId: string | null | undefined) {
  const { data: defs, isLoading } = useQuery<Def>(
    `SELECT id, code, name, data_type, unit, is_required, is_variant_axis, show_in_variant_name, sort_order
       FROM spec_definitions WHERE family_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order, name`, [familyId ?? '']);
  const { data: opts } = useQuery<Opt>(
    `SELECT o.id, o.spec_definition_id, o.value FROM spec_options o
       JOIN spec_definitions d ON d.id = o.spec_definition_id
      WHERE d.family_id = ? AND COALESCE(o.is_active, 1) = 1 ORDER BY o.sort_order, o.value`, [familyId ?? '']);
  const optsByDef = useMemo(() => {
    const m = new Map<string, Opt[]>();
    for (const o of opts ?? []) {
      if (!m.has(o.spec_definition_id)) m.set(o.spec_definition_id, []);
      m.get(o.spec_definition_id)!.push(o);
    }
    return m;
  }, [opts]);
  return { defs: defs ?? [], optsByDef, isLoading };
}

/** The words a value reads as — "H4", "60 W", "Black, Beige". */
export function displayOf(d: Def, v: SpecVal | undefined, options: Opt[]): string {
  if (!v) return '';
  // A value typed in because the list did not have it (staff, 9 Oct 2026:
  // "spoiler mein grey colour nahi aa raha") reads as typed.
  if (d.data_type === 'select') return options.find((o) => o.id === v.option_id)?.value ?? (v.text ?? '').trim();
  if (d.data_type === 'multiselect') return (v.option_ids ?? []).map((oid) => options.find((o) => o.id === oid)?.value).filter(Boolean).join(', ');
  if (d.data_type === 'number') return v.number != null ? `${v.number}${d.unit ? ` ${d.unit}` : ''}` : '';
  if (d.data_type === 'boolean') return v.bool == null ? '' : v.bool ? `${d.name}: Haan` : '';
  return (v.text ?? '').trim();
}

/** The filled-in fields as a proposal carries them. */
export function buildSpecs(defs: Def[], optsByDef: Map<string, Opt[]>, values: Record<string, SpecVal>,
  inheritedFrom?: Record<string, SpecVal>): ProposalSpec[] {
  return defs.map((d) => {
    const v = values[d.id] ?? {};
    const display = displayOf(d, v, optsByDef.get(d.id) ?? []);
    return {
      def_id: d.id, name: d.name, axis: !!d.is_variant_axis, in_name: !!d.show_in_variant_name, sort: d.sort_order, display,
      option_id: d.data_type === 'select' ? v.option_id ?? null : null,
      option_ids: d.data_type === 'multiselect' && v.option_ids?.length ? v.option_ids.join(',') : null,
      text: d.data_type === 'text' || d.data_type === 'multiselect' || (d.data_type === 'select' && !v.option_id) ? display || null : null,
      number: d.data_type === 'number' ? v.number ?? null : null,
      bool: d.data_type === 'boolean' ? v.bool ?? null : null,
      inherited: !!inheritedFrom && sameVal(v, inheritedFrom[d.id]),
    };
  }).filter((s) => s.display);
}

/** The field that tells one kism from the next — a bulb's socket. */
export const keyDefOf = (defs: Def[]) => defs.find((d) => d.is_required && d.is_variant_axis) ?? null;

/**
 * A new option for a detail, made on the spot. Only someone who may change
 * the catalogue gets one (spec_options is catalog.edit); for everyone else
 * the value is kept as typed on the kism and the owner can add it to the
 * list later — nobody is held up by a list that is missing a colour.
 */
export function useNewOption(): ((defId: string, value: string) => Promise<string | null>) | undefined {
  const { db } = useSystem();
  const { can } = useSession();
  const make = useCallback(async (defId: string, value: string) => {
    const v = value.trim();
    if (!v) return null;
    return insertRow(db, 'spec_options', {
      spec_definition_id: defId, value: v, code: slug(v, 12) || v.toUpperCase().slice(0, 12), sort_order: 999, is_active: true,
    });
  }, [db]);
  return can('catalog.edit') ? make : undefined;
}

/** Detail fields for a category: chips for short lists, a list for long ones. */
export function SpecFields({ defs, optsByDef, values, onChange, required }: {
  defs: Def[];
  optsByDef: Map<string, Opt[]>;
  values: Record<string, SpecVal>;
  onChange: (defId: string, v: SpecVal) => void;
  /** Field ids that must be filled, marked with a *. */
  required?: Set<string>;
}) {
  const newOption = useNewOption();
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  /** A value the list did not have: an option of it for the owner, typed text for staff. */
  async function addValue(d: Def, typed: string) {
    const val = typed.trim();
    if (!val) return;
    const options = optsByDef.get(d.id) ?? [];
    const multi = d.data_type === 'multiselect';
    const v = values[d.id] ?? {};
    const match = options.find((o) => o.value.toLowerCase() === val.toLowerCase());
    const id = match?.id ?? (newOption ? await newOption(d.id, val) : null);
    if (id) onChange(d.id, multi ? { option_ids: [...new Set([...(v.option_ids ?? []), id])] } : { option_id: id, text: undefined });
    else if (!multi) onChange(d.id, { option_id: null, text: val });
    setAdding(null);
    setDraft('');
  }

  return (
    <>
      {defs.map((d) => {
        const v = values[d.id] ?? {};
        const options = optsByDef.get(d.id) ?? [];
        const label = `${d.name}${d.unit ? ` (${d.unit})` : ''}${required?.has(d.id) ? ' *' : ''}`;
        const typed = d.data_type === 'select' && !v.option_id && v.text?.trim() ? v.text.trim() : null;
        if (d.data_type === 'select' && options.length > 14) {
          return (
            <View key={d.id} style={{ gap: space.xs }}>
              <SelectField label={label} value={v.option_id ?? null} allowClear
                options={options.map((o) => ({ value: o.id, label: o.value }))}
                onChange={(oid) => onChange(d.id, { option_id: oid, text: undefined })}
                onCreate={(text) => addValue(d, text)} />
              {typed ? <Text variant="small" color="textMuted">Likha hua: {typed} — owner list mein jod dega</Text> : null}
            </View>
          );
        }
        if (d.data_type === 'select' || d.data_type === 'multiselect') {
          const multi = d.data_type === 'multiselect';
          // A typed value is offered to staff only where it can be kept: on a single choice.
          const canAdd = !!newOption || !multi;
          return (
            <View key={d.id} style={{ gap: space.xs }}>
              <Text variant="label" color="textMuted">{label}</Text>
              <Row gap={space.xs} wrap>
                {options.map((o) => {
                  const on = multi ? (v.option_ids ?? []).includes(o.id) : v.option_id === o.id;
                  return (
                    <Chip key={o.id} label={o.value} selected={on} onPress={() => onChange(d.id, multi
                      ? { option_ids: on ? (v.option_ids ?? []).filter((x) => x !== o.id) : [...(v.option_ids ?? []), o.id] }
                      : { option_id: on ? null : o.id, text: undefined })} />
                  );
                })}
                {typed ? <Chip label={`${typed}  ✕`} selected onPress={() => onChange(d.id, { option_id: null, text: undefined })} /> : null}
                {canAdd && adding !== d.id ? <Chip label="+ Aur" onPress={() => { setAdding(d.id); setDraft(''); }} /> : null}
              </Row>
              {adding === d.id ? (
                <Row gap={space.sm} align="flex-end">
                  <Input containerStyle={{ flex: 1 }} value={draft} onChangeText={setDraft} autoFocus
                    placeholder={`Naya ${d.name.toLowerCase()} likho — jaise Grey`} onSubmitEditing={() => addValue(d, draft)} />
                  <Button title="Jodo" size="sm" onPress={() => addValue(d, draft)} disabled={!draft.trim()} />
                  <Button title="✕" tone="ghost" size="sm" onPress={() => setAdding(null)} />
                </Row>
              ) : null}
            </View>
          );
        }
        if (d.data_type === 'number') {
          return <NumberField key={d.id} label={label} value={v.number ?? null} onChange={(n) => onChange(d.id, { number: n })} />;
        }
        if (d.data_type === 'boolean') {
          return (
            <View key={d.id} style={{ gap: space.xs }}>
              <Text variant="label" color="textMuted">{label}</Text>
              <Row gap={space.xs}>
                <Chip label="Haan" selected={v.bool === true} onPress={() => onChange(d.id, { bool: v.bool === true ? null : true })} />
                <Chip label="Nahi" selected={v.bool === false} onPress={() => onChange(d.id, { bool: v.bool === false ? null : false })} />
              </Row>
            </View>
          );
        }
        return <Input key={d.id} label={label} value={v.text ?? ''} onChangeText={(text) => onChange(d.id, { text })} autoCorrect={false} />;
      })}
    </>
  );
}

type Model = { id: string; name: string; make_name: string };
type Gen = { id: string; model_id: string; name: string; year_from: number | null; year_to: number | null };

/** All cars, for labels and the picker. */
export function useModels() {
  const { data } = useQuery<Model>(
    'SELECT vm.id, vm.name, mk.name AS make_name FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id WHERE vm.is_active = 1 ORDER BY mk.name, vm.name');
  return data ?? [];
}

/** A fit as stored and shown: label "Creta 2019–2023", make "Hyundai". */
export function fitWithLabel(f: ProposalFit, models: Model[]): ProposalFit {
  const m = models.find((x) => x.id === f.model_id);
  return { ...f, label: `${m?.name ?? ''}${yearsLabel(f)}`.trim(), make: m?.make_name };
}

/**
 * The cars a kism goes on: chips for the chosen ones (tap to remove), and a
 * company + model list. Choosing a car adds it at once — a car chosen and
 * then lost because a second "add" button was not pressed is how a kism
 * ended up with no car. The years then fill in that same car, from its
 * generation chips or typed.
 */
export function CarPicker({ fits, onChange, models, universal, onUniversal, onAddCar }: {
  fits: ProposalFit[];
  onChange: (fits: ProposalFit[]) => void;
  models: Model[];
  universal?: boolean;
  /** Offer "Sab gaadi" — for items sold by spec, not by car. */
  onUniversal?: (v: boolean) => void;
  /** Add a model that is not in the list (owner). */
  onAddCar?: (name: string) => Promise<string | null>;
}) {
  // The car whose years are being filled: the one chosen last.
  const [editing, setEditing] = useState<number | null>(null);
  const current = editing != null ? fits[editing] ?? null : null;
  const { data: gens } = useQuery<Gen>(
    'SELECT id, model_id, name, year_from, year_to FROM vehicle_generations WHERE model_id = ? ORDER BY year_from', [current?.model_id ?? '']);
  const label = (mid: string) => { const m = models.find((x) => x.id === mid); return m ? `${m.make_name} ${m.name}` : 'Gaadi'; };

  function choose(modelId: string | null) {
    if (!modelId) { setEditing(null); return; }
    const open = fits.findIndex((f) => f.model_id === modelId && !f.year_from && !f.year_to);
    if (open >= 0) { setEditing(open); return; }
    onChange([...fits, fitWithLabel({ model_id: modelId, year_from: null, year_to: null }, models)]);
    onUniversal?.(false);
    setEditing(fits.length);
  }
  function years(from: number | null, to: number | null) {
    if (editing == null || !current) return;
    onChange(fits.map((f, i) => (i === editing ? fitWithLabel({ ...f, year_from: from, year_to: to }, models) : f)));
  }
  const backwards = !!(current?.year_from && current?.year_to && current.year_to < current.year_from);

  return (
    <View style={{ gap: space.sm }}>
      <Row gap={space.xs} wrap>
        {onUniversal ? <Chip label="Sab gaadi" selected={!!universal} onPress={() => { onUniversal(!universal); if (!universal) { onChange([]); setEditing(null); } }} /> : null}
        {fits.map((f, i) => (
          <Chip key={`${f.model_id}-${i}`} label={`${label(f.model_id)}${yearsLabel(f)}  ✕`} selected
            onPress={() => { onChange(fits.filter((_, j) => j !== i)); setEditing(null); }} />
        ))}
      </Row>
      {!universal ? (
        <>
          <SelectField
            label={fits.length ? 'Aur gaadi (company + model)' : 'Gaadi (company + model)'}
            value={null}
            options={models.map((m) => ({ value: m.id, label: `${m.make_name} ${m.name}` }))}
            onChange={choose}
            onCreate={onAddCar ? async (text) => { const id = await onAddCar(text); if (id) choose(id); } : undefined}
            placeholder="Creta, Swift, Nexon…"
          />
          {current ? (
            <View style={{ gap: space.xs }}>
              <Text variant="label" color="textMuted">{label(current.model_id)} — kaunse saal (zaroori nahi)</Text>
              {(gens ?? []).length > 0 ? (
                <Row gap={space.xs} wrap>
                  {(gens ?? []).map((g) => (
                    <Chip key={g.id} label={/\d{4}/.test(g.name) ? g.name : `${g.name}${yearsLabel(g)}`} selected={current.year_from === g.year_from && current.year_to === g.year_to}
                      onPress={() => years(g.year_from, g.year_to)} />
                  ))}
                </Row>
              ) : null}
              <Row gap={12} align="flex-end">
                <View style={{ flex: 1 }}><NumberField label="Saal se" value={current.year_from ?? null} onChange={(n) => years(n, current.year_to ?? null)} decimals={0} placeholder="2019" /></View>
                <View style={{ flex: 1 }}><NumberField label="Saal tak" value={current.year_to ?? null} onChange={(n) => years(current.year_from ?? null, n)} decimals={0} placeholder="2023" /></View>
              </Row>
              {backwards ? <Text variant="small" color="danger">“Tak” wala saal “Se” se pehle nahi ho sakta.</Text> : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** A car whose "to" year is before its "from" year — refuse to save it. */
export const badYears = (fits: ProposalFit[]) => fits.some((f) => !!(f.year_from && f.year_to && f.year_to < f.year_from));

/**
 * A kism's identity: its own detail values and its cars. Two kisms with the
 * same signature are the same thing on the shelf, so Stock Chadhao reuses the
 * one that exists instead of making a twin.
 */
export function kismSignature(specs: { def_id: string; display: string }[], fits: { model_id: string; year_from?: number | null; year_to?: number | null }[]): string {
  const s = specs.filter((x) => x.display.trim()).map((x) => `${x.def_id}=${x.display.trim().toLowerCase()}`).sort();
  const f = fits.map((x) => `${x.model_id}:${x.year_from ?? ''}-${x.year_to ?? ''}`).sort();
  return JSON.stringify([s, f]);
}
