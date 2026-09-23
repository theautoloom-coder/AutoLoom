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
        <KV k="Net" v={<Badge tone={status.connected ? 'ok' : 'warn'}>{status.connected ? 'Juda hua' : 'Offline'}</Badge>} />
        <KV k="Kaun logged in hai" v={session?.user.email ?? '—'} />
        <KV k="Aakhri sync" v={status.lastSyncedAt ? status.lastSyncedAt.toLocaleString('en-IN') : 'Kabhi nahi'} />
        <KV k="Aa raha hai" v={status.dataFlowStatus.downloading ? 'Haan' : 'Nahi'} />
        <KV k="Ja raha hai" v={status.dataFlowStatus.uploading ? 'Haan' : 'Nahi'} />
        <KV k="Jo abhi bheja nahi gaya" v={String(pending)} mono />
        {progress ? <KV k="Pehli baar aa raha hai" v={`${progress.downloadedOperations} / ${progress.totalOperations} row`} mono /> : null}
        {status.downloadError || status.uploadError ? (
          <>
            <Divider />
            <Text variant="small" color="danger">
              {describeSyncError(status.downloadError ?? status.uploadError)}
            </Text>
          </>
        ) : null}
      </Card>

      <Button title="Abhi sync karo" onPress={forceSync} loading={busy} />

      <SectionTitle>Sync kaise chalta hai</SectionTitle>
      <Card tone="alt">
        <Text variant="small" color="textMuted">
          Har screen isi phone ke database se padhti aur likhti hai, isliye signal na ho tab bhi app chalti hai. Har badlav ruk kar rakha jaata hai aur net aate hi chala jaata hai. Post hua document, uska stock aur uska khata — teeno saath jaate hain, isliye server ko kabhi aadha bill nahi milta.
        </Text>
      </Card>

      {connector.failures.length > 0 ? (
        <>
          <SectionTitle>Jo upload nahi ho paaya</SectionTitle>
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
