import PropTypes from 'prop-types';
import { Box, Stack, Typography } from '@mui/material';

import AnprStatusChip from './AnprStatusChip';

const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const shortenHash = (value) => {
  if (!value || typeof value !== 'string') return '—';
  const trimmed = value.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`;
};

function ProofRow({ label, value }) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

ProofRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired
};

export default function AnprBlockchainProofSection({ eventProof, imageProofSummary }) {
  if (!eventProof && !imageProofSummary) {
    return null;
  }

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 2
      }}
    >
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Blockchain proof
      </Typography>

      <Stack spacing={2}>
        {eventProof ? (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2">Event proof</Typography>
              <AnprStatusChip kind="blockchain" value={eventProof.status || 'unknown'} />
            </Stack>
            <ProofRow label="Network" value={`${eventProof.network || '—'} (${eventProof.environment || '—'})`} />
            <ProofRow label="Tx hash" value={shortenHash(eventProof.txHash)} />
            <ProofRow label="Confirmations" value={eventProof.confirmations ?? '—'} />
            <ProofRow label="Submitted" value={formatTimestamp(eventProof.submittedAt)} />
            <ProofRow label="Confirmed" value={formatTimestamp(eventProof.confirmedAt)} />
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No event blockchain proof is available yet.
          </Typography>
        )}

        {imageProofSummary ? (
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Image proofs</Typography>
            <Typography variant="body2">
              {imageProofSummary.count} proof{imageProofSummary.count === 1 ? '' : 's'}
              {imageProofSummary.confirmedCount > 0
                ? ` · ${imageProofSummary.confirmedCount} confirmed`
                : ''}
            </Typography>
            {Array.isArray(imageProofSummary.statuses) && imageProofSummary.statuses.length > 0 ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {imageProofSummary.statuses.map((status) => (
                  <AnprStatusChip key={status} kind="blockchain" value={status} />
                ))}
              </Stack>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}

AnprBlockchainProofSection.propTypes = {
  eventProof: PropTypes.shape({
    id: PropTypes.string,
    status: PropTypes.string,
    network: PropTypes.string,
    environment: PropTypes.string,
    txHash: PropTypes.string,
    confirmations: PropTypes.number,
    submittedAt: PropTypes.string,
    confirmedAt: PropTypes.string
  }),
  imageProofSummary: PropTypes.shape({
    count: PropTypes.number,
    confirmedCount: PropTypes.number,
    statuses: PropTypes.arrayOf(PropTypes.string)
  })
};
