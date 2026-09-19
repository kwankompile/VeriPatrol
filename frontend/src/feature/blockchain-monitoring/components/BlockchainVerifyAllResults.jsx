import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import BlockchainNetworkBadge from './BlockchainNetworkBadge';
import BlockchainStatusChip from './BlockchainStatusChip';
import { formatStatusLabel, shortHash } from '../repositories/BlockchainMonitoringRepository';

const ENTITY_TYPE_LABELS = {
  anpr_event: 'ANPR Event',
  anpr_image: 'ANPR Image',
  patrol_session: 'Patrol Session',
  user_profile: 'User Profile'
};

function HashLine({ label, value }) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
        {value || '—'}
      </Typography>
    </Stack>
  );
}

HashLine.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string
};

function VerifyAllIssueCard({ issue, onViewDetails }) {
  const entityLabel = ENTITY_TYPE_LABELS[issue.entityType] ?? issue.entityType ?? '—';

  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        p: 2,
        borderColor: issue.result === 'tampered' ? 'error.light' : 'warning.light',
        bgcolor:
          issue.result === 'tampered'
            ? alpha(theme.palette.error.main, 0.06)
            : alpha(theme.palette.warning.main, 0.06)
      })}
      data-testid={`blockchain-verify-issue-${issue.recordId}`}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <BlockchainStatusChip kind="verification" value={issue.result} />
          <Typography variant="subtitle2">{entityLabel}</Typography>
          {issue.network || issue.environment ? (
            <BlockchainNetworkBadge network={issue.network} environment={issue.environment} />
          ) : null}
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Record ID:{' '}
          <Typography component="span" variant="body2" fontFamily="monospace">
            {issue.recordIdShort}
          </Typography>
        </Typography>

        {issue.entityId ? (
          <Typography variant="body2" color="text.secondary">
            Source entity:{' '}
            <Typography component="span" variant="body2" fontFamily="monospace">
              {issue.entityId}
            </Typography>
          </Typography>
        ) : null}

        {issue.proofType ? (
          <Typography variant="body2" color="text.secondary">
            Proof type: {issue.proofType}
          </Typography>
        ) : null}

        {issue.chainId ? (
          <Typography variant="body2" color="text.secondary">
            Chain ID: {issue.chainId}
          </Typography>
        ) : null}

        {issue.contractAddress ? (
          <HashLine label="Contract" value={issue.contractAddressShort} />
        ) : null}

        <HashLine label="Expected (stored)" value={issue.storedHash} />
        <HashLine label="Actual (recomputed)" value={issue.recomputedHash} />
        <HashLine label="On-chain hash" value={issue.onchainHash} />

        {issue.onchainFound != null ? (
          <Typography variant="body2">On-chain found: {issue.onchainFound ? 'Yes' : 'No'}</Typography>
        ) : null}

        {issue.errorMessage ? (
          <Typography variant="body2" color="error.main">
            {issue.errorMessage}
          </Typography>
        ) : null}

        <Box>
          <Button component={RouterLink} to={`/admin/blockchain-monitoring/${issue.recordId}`} size="small" variant="outlined">
            View record
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

VerifyAllIssueCard.propTypes = {
  issue: PropTypes.object.isRequired,
  onViewDetails: PropTypes.func
};

function normalizeIssue(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const result = raw.result ?? 'unknown';
  return {
    recordId: raw.record_id ?? null,
    recordIdShort: shortHash(raw.record_id, 8, 6),
    entityType: raw.entity_type ?? null,
    entityId: raw.entity_id ?? null,
    proofType: raw.proof_type ?? null,
    network: raw.network ?? null,
    environment: raw.environment ?? null,
    chainId: raw.chain_id ?? null,
    contractAddress: raw.contract_address ?? null,
    contractAddressShort: shortHash(raw.contract_address, 6, 4),
    result,
    resultLabel: formatStatusLabel(result, { tampered: 'Tampered', onchain_missing: 'On-chain Missing', failed: 'Failed' }),
    storedHash: raw.stored_hash ?? null,
    recomputedHash: raw.recomputed_hash ?? null,
    onchainHash: raw.onchain_hash ?? null,
    onchainFound: raw.onchain_found ?? null,
    errorMessage: raw.error_message ?? null
  };
}

export function normalizeVerifyAllSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return {
      totalScanned: 0,
      valid: 0,
      tampered: 0,
      pending: 0,
      onchainMissing: 0,
      failed: 0,
      errors: 0,
      tamperedRecords: [],
      onchainMissingRecords: [],
      failedRecords: [],
      issueRecords: []
    };
  }

  const tamperedRecords = (Array.isArray(summary.tampered_records) ? summary.tampered_records : [])
    .map(normalizeIssue)
    .filter(Boolean);
  const onchainMissingRecords = (Array.isArray(summary.onchain_missing_records) ? summary.onchain_missing_records : [])
    .map(normalizeIssue)
    .filter(Boolean);
  const failedRecords = (Array.isArray(summary.failed_records) ? summary.failed_records : [])
    .map(normalizeIssue)
    .filter(Boolean);

  return {
    totalScanned: Number(summary.total_scanned ?? 0),
    valid: Number(summary.valid ?? 0),
    tampered: Number(summary.tampered ?? 0),
    pending: Number(summary.pending ?? 0),
    onchainMissing: Number(summary.onchain_missing ?? 0),
    failed: Number(summary.failed ?? 0),
    errors: Number(summary.errors ?? 0),
    tamperedRecords,
    onchainMissingRecords,
    failedRecords,
    issueRecords: [...tamperedRecords, ...onchainMissingRecords, ...failedRecords]
  };
}

export default function BlockchainVerifyAllResults({ summary, onViewDetails }) {
  const normalized = normalizeVerifyAllSummary(summary);

  if (!normalized.totalScanned) {
    return null;
  }

  const hasIssues = normalized.issueRecords.length > 0;

  return (
    <Stack spacing={2} data-testid="blockchain-verify-all-results">
      {normalized.valid > 0 ? (
        <Paper
          variant="outlined"
          sx={(theme) => ({
            p: 2,
            borderColor: 'success.light',
            bgcolor: alpha(theme.palette.success.main, 0.06)
          })}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <BlockchainStatusChip kind="verification" value="valid" />
            <Typography variant="body1">
              {normalized.valid} record{normalized.valid === 1 ? '' : 's'} verified successfully.
            </Typography>
          </Stack>
        </Paper>
      ) : null}

      <Typography variant="body2" color="text.secondary">
        Scanned {normalized.totalScanned} record(s): {normalized.valid} valid, {normalized.tampered} tampered,{' '}
        {normalized.onchainMissing} on-chain missing, {normalized.failed} failed, {normalized.errors} errors.
      </Typography>

      {!hasIssues ? (
        <Typography variant="body2" color="text.secondary">
          No tampered or failed records were detected in this verification run.
        </Typography>
      ) : null}

      {normalized.tamperedRecords.length > 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="h6" color="error.main">
            Tampered records ({normalized.tamperedRecords.length})
          </Typography>
          {normalized.tamperedRecords.map((issue) => (
            <VerifyAllIssueCard key={issue.recordId} issue={issue} onViewDetails={onViewDetails} />
          ))}
        </Stack>
      ) : null}

      {normalized.onchainMissingRecords.length > 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="h6" color="warning.main">
            On-chain missing ({normalized.onchainMissingRecords.length})
          </Typography>
          {normalized.onchainMissingRecords.map((issue) => (
            <VerifyAllIssueCard key={issue.recordId} issue={issue} onViewDetails={onViewDetails} />
          ))}
        </Stack>
      ) : null}

      {normalized.failedRecords.length > 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="h6" color="warning.main">
            Verification failed ({normalized.failedRecords.length})
          </Typography>
          {normalized.failedRecords.map((issue) => (
            <VerifyAllIssueCard key={issue.recordId} issue={issue} onViewDetails={onViewDetails} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

BlockchainVerifyAllResults.propTypes = {
  summary: PropTypes.object,
  onViewDetails: PropTypes.func
};
