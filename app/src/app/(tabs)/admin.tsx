/**
 * Admin — the shop's control room.
 *
 * This was a settings index: thirteen identical rows in one narrow column, in
 * the order the features happened to be built, with staff and approvals missing
 * from it entirely. Nothing on it told the owner what needed doing, and on a
 * counter monitor it used half the screen.
 *
 * It is now ordered by what actually asks for the owner's attention:
 *
 *   1. anything waiting on a decision, stated once and loudly
 *   2. the team — approvals and staff, the two things only an owner does
 *   3. the catalogue, which is where the daily work is
 *   4. parties and business settings
 *   5. the master-data screens, folded away — they are opened a few times a
 *      year and were taking up a third of the page
 *
 * Tiles rather than rows because a tile can carry a number, and the number is
 * usually the answer: "Saara maal · 0" says more than "Saara maal ›".
 */
import { useQuery } from '@powersync/react';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';

import { useSession } from '@/lib/session';
import { Badge, Button, Card, Empty, Grid, ListRow, Row, Screen, SectionTitle, StatTile, Text } from '@/ui';
import { space } from '@/ui/theme';

type Counts = {
  families: number; products: number; variants: number; models: number;
  brands: number; customers: number; suppliers: number; locations: number;
  staff: number; staff_active: number;
};

export default function AdminHome() {
  const router = useRouter();
  const { can, profile } = useSession();
  const [advanced, setAdvanced] = useState(false);

  const { data: rows } = useQuery<Counts>(`
    SELECT (SELECT COUNT(*) FROM product_families WHERE is_active = 1) AS families,
           (SELECT COUNT(*) FROM products WHERE is_active = 1) AS products,
           (SELECT COUNT(*) FROM product_variants WHERE is_active = 1) AS variants,
           (SELECT COUNT(*) FROM vehicle_models WHERE is_active = 1) AS models,
           (SELECT COUNT(*) FROM brands WHERE is_active = 1) AS brands,
           (SELECT COUNT(*) FROM customers WHERE is_active = 1) AS customers,
           (SELECT COUNT(*) FROM suppliers WHERE is_active = 1) AS suppliers,
           (SELECT COUNT(*) FROM locations WHERE is_active = 1) AS locations,
           (SELECT COUNT(*) FROM profiles) AS staff,
           (SELECT COUNT(*) FROM profiles WHERE is_active = 1) AS staff_active`);
  const n = rows?.[0];

  const { data: reqRows } = useQuery<{ pending: number }>(
    "SELECT COUNT(*) AS pending FROM change_requests WHERE status = 'pending'");
  const pending = reqRows?.[0]?.pending ?? 0;

  const isAdmin = can('admin.users');
  const canCatalog = can('catalog.edit');
  const canParty = can('party.edit');
  const canSettings = can('admin.settings');

  if (!canCatalog && !canSettings && !canParty && !isAdmin) {
    return (
      <Screen>
        <Empty title="Admin sirf owner aur admin ke liye hai" />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Admin' }} />
      <Screen>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="display">Admin</Text>
          {profile?.role ? <Badge tone="neutral">{String(profile.role).toUpperCase()}</Badge> : null}
        </Row>

        {/* The one thing on this page that is time-sensitive. It appears only
            when there is something to do, so it never becomes wallpaper. */}
        {pending > 0 ? (
          <Card keyline spine="accent">
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }} gap={space.md}>
              <Text variant="rowTitle" style={{ flex: 1 }}>
                {pending === 1
                  ? '1 request aapke faisle ka intezaar kar rahi hai'
                  : `${pending} requests aapke faisle ka intezaar kar rahi hain`}
              </Text>
              <Button title="Dekho" onPress={() => router.push('/requests')} />
            </Row>
          </Card>
        ) : null}

        {/* Team first: these are the two things nobody but the owner can do,
            and they were the two missing from this screen entirely. */}
        <SectionTitle>Team aur approvals</SectionTitle>
        <Grid min={240}>
          <StatTile
            label="REQUESTS"
            value={String(pending)}
            sub={pending > 0 ? 'approve karni hain' : 'kuch pending nahi'}
            icon="checkmark-done-outline"
            accent="amber"
            tone={pending > 0 ? 'warn' : undefined}
            onPress={() => router.push('/requests')}
          />
          {isAdmin ? (
            <StatTile
              label="STAFF"
              value={String(n?.staff_active ?? 0)}
              sub="login banao, role badlo"
              icon="people-outline"
              accent="violet"
              onPress={() => router.push('/admin/users')}
            />
          ) : null}
          {isAdmin ? (
            <StatTile
              label="KISNE KYA KIYA"
              value="👁"
              sub="har bill, rate aur setting ka record"
              icon="time-outline"
              accent="blue"
              onPress={() => router.push('/activity')}
            />
          ) : null}
          {canSettings ? (
            <StatTile
              label="DUKAAN"
              value="⚙"
              sub="naam, GST, WhatsApp, bill footer"
              icon="storefront-outline"
              accent="teal"
              onPress={() => router.push('/admin/settings')}
            />
          ) : null}
        </Grid>

        {canCatalog ? (
          <>
            <SectionTitle>Maal</SectionTitle>
            <Grid min={240}>
              <StatTile
                label="NAYA ITEM"
                value="+"
                sub="category, car, colour, rate — ek page"
                icon="add-circle-outline"
                accent="rose"
                onPress={() => router.push('/admin/item')}
              />
              <StatTile
                label="SAARA MAAL"
                value={String(n?.products ?? 0)}
                sub={`${n?.variants ?? 0} SKU`}
                icon="cube-outline"
                accent="blue"
                onPress={() => router.push('/admin/products')}
              />
              <StatTile
                label="IMPORT"
                value="CSV"
                sub="bulk maal, customers, opening stock"
                icon="cloud-upload-outline"
                accent="green"
                onPress={() => router.push('/admin/import')}
              />
            </Grid>
          </>
        ) : null}

        {canParty ? (
          <>
            <SectionTitle>Party</SectionTitle>
            <Grid min={240}>
              <StatTile
                label="CUSTOMERS"
                value={String(n?.customers ?? 0)}
                sub="khata, credit limit"
                icon="person-outline"
                accent="teal"
                onPress={() => router.push('/customers')}
              />
              <StatTile
                label="SUPPLIERS"
                value={String(n?.suppliers ?? 0)}
                sub="kis se maal aata hai"
                icon="business-outline"
                accent="violet"
                onPress={() => router.push('/suppliers')}
              />
              <StatTile
                label="RATE LIST"
                value="₹"
                sub="retail, dealer, wholesale"
                icon="pricetags-outline"
                accent="amber"
                onPress={() => router.push('/admin/masters?type=price_lists')}
              />
            </Grid>
          </>
        ) : null}

        {/* Opened a handful of times a year, and it was taking a third of the
            page. Folded away rather than removed. */}
        {canCatalog || canSettings ? (
          <>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm }}>
              <SectionTitle>Advanced</SectionTitle>
              <Button
                title={advanced ? 'Band karo' : 'Kholo'}
                tone="ghost"
                onPress={() => setAdvanced(!advanced)}
              />
            </Row>
            {advanced ? (
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                {canCatalog ? (
                  <>
                    <ListRow
                      title="Categories aur spec templates"
                      subtitle={`${n?.families ?? 0} categories — sirf tab jab spec-wise SKU banane hon`}
                      onPress={() => router.push('/admin/families')}
                    />
                    <ListRow
                      title="Vehicle master"
                      subtitle={`${n?.models ?? 0} models, generations, aliases`}
                      onPress={() => router.push('/admin/vehicles')}
                    />
                    <ListRow
                      title="Brands, units, HSN"
                      subtitle={`${n?.brands ?? 0} brands · master data`}
                      onPress={() => router.push('/admin/masters?type=brands')}
                    />
                  </>
                ) : null}
                {canSettings ? (
                  <>
                    <ListRow title="Locations" subtitle={`${n?.locations ?? 0} — warehouse, counter, workshop`} onPress={() => router.push('/admin/masters?type=locations')} />
                    <ListRow title="Tax rates" subtitle="GST slabs, effective dates ke saath" onPress={() => router.push('/admin/masters?type=tax_rates')} />
                    <ListRow title="Numbering series" subtitle="Bill, credit note aur purchase number ka format" onPress={() => router.push('/admin/masters?type=document_sequences')} />
                  </>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}
      </Screen>
    </>
  );
}
