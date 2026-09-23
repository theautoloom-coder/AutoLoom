import { useQuery, useStatus } from '@powersync/react';
import React, { useState } from 'react';

import { useSession } from '@/lib/session';
import { describeSyncError, useSystem } from '@/lib/system';
import { Badge, Button, Card, Divider, KV, Screen, SectionTitle, Text } from '@/ui';

export default function SyncScreen() {
  const status = useStatus();
  const { connector, connect, syncError } = useSystem();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  const { data: pendingRows } = useQuery<{ n: number }>('SELECT COUNT(*) AS n FROM ps_crud');
  const pending = pendingRows?.[0]?.n ?? 0;

  async function forceSync() {
    setBusy(true);
    try {
      // connect() is a no-op once connected; calling db.connect as well used to
      // open a second sync stream. One call, and its error is already captured
      // and shown above rather than thrown at the user.
      await connect().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const progress = status.downloadProgress;

  return (
    <Screen>
      {!status.connected && (syncError || status.downloadError || status.uploadError) ? (
        <Card keyline spine="accent">
          <Text variant="label" color="danger">SYNC KYUN RUKA HAI</Text>
          <Text variant="small">{syncError || describeSyncError(status.downloadError ?? status.uploadError)}</Text>
          <Text variant="small" color="textMuted">
            Ye device offline hone se alag hai. Aapke changes surakshit hain aur upload ho jayenge jaise hi sync chalu hoga.
          </Text>
        </Card>
      ) : null}

      <Card>
        <KV k="Connection" v={<Badge tone={status.connected ? 'ok' : 'warn'}>{status.connected ? 'Connected' : 'Offline'}</Badge>} />
        <KV k="Signed in as" v={session?.user.email ?? '—'} />
        <KV k="Last synced" v={status.lastSyncedAt ? status.lastSyncedAt.toLocaleString('en-IN') : 'Never'} />
        <KV k="Downloading" v={status.dataFlowStatus.downloading ? 'Yes' : 'No'} />
        <KV k="Uploading" v={status.dataFlowStatus.uploading ? 'Yes' : 'No'} />
        <KV k="Pending local changes" v={String(pending)} mono />
        {progress ? <KV k="First download" v={`${progress.downloadedOperations} / ${progress.totalOperations} rows`} mono /> : null}
        {status.downloadError || status.uploadError ? (
          <>
            <Divider />
            <Text variant="small" color="danger">
              {describeSyncError(status.downloadError ?? status.uploadError)}
            </Text>
          </>
        ) : null}
      </Card>

      <Button title="Sync now" onPress={forceSync} loading={busy} />

      <SectionTitle>How sync works here</SectionTitle>
      <Card tone="alt">
        <Text variant="small" color="textMuted">
          Every screen reads and writes the database on this device, so the app works with no signal. Each change is queued and uploaded when a connection exists. A posted document, its stock movements and its ledger entries travel together as one unit, so the server never sees half an invoice.
        </Text>
      </Card>

      {connector.failures.length > 0 ? (
        <>
          <SectionTitle>Rejected uploads</SectionTitle>
          <Card style={{ gap: 0 }}>
            {connector.failures.map((f, i) => (
              <React.Fragment key={`${f.id}-${i}`}>
                {i > 0 ? <Divider /> : null}
                <KV k={`${f.table} · ${f.op}`} v={`${f.code ?? ''} ${f.message}`} />
              </React.Fragment>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
