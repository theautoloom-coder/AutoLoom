/**
 * The "Preparing draft…" state, with a deadline.
 *
 * Every document screen creates its draft locally and then waits for the row
 * to come back. When the server refuses that insert, PowerSync quietly reverts
 * the local row and the wait never ends — the screen shows "Preparing draft…"
 * for ever with no error, no retry and no way to tell it apart from a slow
 * connection. That exact failure has now been diagnosed three times, twice from
 * a screenshot, because the screen itself never said anything.
 *
 * So it says something. After a few seconds it stops pretending to load and
 * reports what is actually known: whether sync is even connected, what the sync
 * service last complained about, and what the user can do instead of staring at
 * it. The draft may still arrive — if it does, the screen moves on by itself.
 */
import { useStatus } from '@powersync/react';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { describeSyncError, useSystem } from '@/lib/system';

import { Button, Card, Row, Screen, Text } from './index';
import { space } from './theme';

/** How long a draft may take before we stop calling it "loading". */
const PATIENCE_MS = 7000;

export function PreparingDraft({ what = 'draft' }: { what?: string }) {
  const [slow, setSlow] = useState(false);
  const status = useStatus();
  const { syncError, connector } = useSystem();
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), PATIENCE_MS);
    return () => clearTimeout(t);
  }, []);

  if (!slow) {
    return (
      <Screen>
        <Text color="textMuted">{what === 'draft' ? 'Draft ban raha hai…' : `${what} khul raha hai…`}</Text>
      </Screen>
    );
  }

  // The most useful thing we know, in the order it is most likely to be true.
  const rejected = connector.failures[0];
  const reason = syncError
    ?? describeSyncError(status.downloadError ?? status.uploadError)
    ?? '';

  return (
    <Screen>
      <Card keyline spine="accent" style={{ gap: space.sm }}>
        <Text variant="label" color="danger">DRAFT NAHI BAN PAAYA</Text>

        {!status.connected ? (
          <Text>
            Sync abhi chalu nahi hai, isliye server ne is draft ko manzoor nahi kiya.
          </Text>
        ) : (
          <Text>
            Server ne is draft ko manzoor nahi kiya, isliye wo wapas le liya gaya.
          </Text>
        )}

        {reason ? (
          <Text variant="small" color="textMuted">{reason}</Text>
        ) : null}

        {rejected ? (
          <Text variant="small" color="textMuted">
            {`Aakhri rukawat: ${rejected.table} · ${rejected.code ?? ''} ${rejected.message}`}
          </Text>
        ) : null}

        <Text variant="small" color="textMuted">
          Agar aapki working location set nahi hai to More → Working location se ek chuno,
          phir dobara koshish karo.
        </Text>

        <Row gap={space.sm}>
          <Button title="Wapas" tone="secondary" onPress={() => router.back()} />
          <Button title="Sync dekho" tone="ghost" onPress={() => router.push('/sync')} />
        </Row>
      </Card>
    </Screen>
  );
}
