import { useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Link,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import { IconRefresh, IconRotateClockwise } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';

import blockchainMonitoringService from '../datasources/blockchainMonitoringService';
import { BlockchainMonitoringRepository } from '../repositories/BlockchainMonitoringRepository';
import { useBlockchainRecordDetailController } from '../controllers/useBlockchainRecordDetailController';
import BlockchainStatusChip from '../components/BlockchainStatusChip';
import BlockchainNetworkBadge from '../components/BlockchainNetworkBadge';
import BlockchainPayloadSummary from '../components/BlockchainPayloadSummary';
import BlockchainJobTimeline from '../components/BlockchainJobTimeline';
import BlockchainVerificationPanel from '../components/BlockchainVerificationPanel';

function DetailRow({ label, value, monospace = false }) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 150 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontFamily={monospace ? 'monospace' : undefined} sx={{ wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function BlockchainRecordDetail() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new BlockchainMonitoringRepository(blockchainMonitoringService);
  }
  const controller = useBlockchainRecordDetailController(repositoryRef.current);

  if (controller.loading) {
    return (
      <MainCard title="Blockchain Record Detail">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      </MainCard>
    );
  }

  if (controller.error && !controller.record) {
    return (
      <MainCard title="Blockchain Record Detail">
        <Alert severity="error" sx={{ mb: 2 }}>
          {controller.error}
        </Alert>
        <Button variant="outlined" onClick={controller.handleBack}>
          Back to dashboard
        </Button>
      </MainCard>
    );
  }

  const record = controller.record;

  return (
    <MainCard
      title="Blockchain Record Detail"
      secondary={
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={controller.handleBack}>
            Back
          </Button>
          <Button
            variant="outlined"
            startIcon={<IconRefresh size={18} />}
            onClick={controller.handleRefresh}
            disabled={controller.refreshing}
          >
            {controller.refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          {record.canRefreshConfirmation ? (
            <Button
              variant="outlined"
              startIcon={<IconRotateClockwise size={18} />}
              onClick={controller.handleRefreshConfirmation}
              disabled={controller.refreshingConfirmation}
            >
              {controller.refreshingConfirmation ? 'Refreshing…' : 'Refresh confirmation'}
            </Button>
          ) : null}
          {controller.isAdmin ? (
            <Button
              variant="contained"
              color="warning"
              onClick={controller.handleRetry}
              disabled={controller.retrying || !record.canRetry}
            >
              {controller.retrying ? 'Retrying…' : 'Retry failed record'}
            </Button>
          ) : null}
        </Stack>
      }
    >
      <Stack spacing={2}>
        {controller.actionMessage ? <Alert severity="success">{controller.actionMessage}</Alert> : null}
        {controller.error ? <Alert severity="error">{controller.error}</Alert> : null}
        {record.lastError ? (
          <Alert severity="error">
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Last error
            </Typography>
            {record.lastError}
          </Alert>
        ) : null}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h6">Record overview</Typography>
              <BlockchainStatusChip value={record.status} />
              <BlockchainNetworkBadge network={record.network} environment={record.environment} />
            </Stack>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack spacing={1}>
                  <DetailRow label="Entity type" value={record.entityTypeLabel} />
                  <DetailRow label="Entity ID" value={record.entityId ?? '—'} monospace />
                  <DetailRow label="Proof type" value={record.proofType} />
                  <DetailRow label="Chain ID" value={record.chainId ?? '—'} />
                  <DetailRow label="Contract address" value={record.contractAddressShort} monospace />
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack spacing={1}>
                  <DetailRow label="Record hash" value={record.recordHash ?? '—'} monospace />
                  <DetailRow
                    label="Transaction hash"
                    value={
                      record.explorerUrl ? (
                        <Link href={record.explorerUrl} target="_blank" rel="noopener noreferrer">
                          {record.txHash}
                        </Link>
                      ) : (
                        record.txHash ?? '—'
                      )
                    }
                    monospace={!record.explorerUrl}
                  />
                  <DetailRow
                    label="Block / confirmations"
                    value={`${record.blockNumber ?? '—'} / ${record.confirmations ?? '—'}`}
                  />
                  <DetailRow label="Retry count" value={record.retryCount} />
                  <DetailRow label="Submitted" value={<MalaysiaTime time={record.submittedAt} />} />
                  <DetailRow label="Confirmed" value={<MalaysiaTime time={record.confirmedAt} />} />
                </Stack>
              </Grid>
            </Grid>
          </Stack>
        </Paper>

        <BlockchainPayloadSummary items={record.payloadSummary} />

        <Paper variant="outlined" sx={{ p: 2 }}>
          <BlockchainJobTimeline jobs={record.jobs} />
        </Paper>

        <BlockchainVerificationPanel
          latestVerification={record.latestVerification}
          verifications={record.verifications}
          canVerify={controller.canVerify}
          verifying={controller.verifying}
          onVerify={controller.handleVerify}
        />
      </Stack>
    </MainCard>
  );
}
