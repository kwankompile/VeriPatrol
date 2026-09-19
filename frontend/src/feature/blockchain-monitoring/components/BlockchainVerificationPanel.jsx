import PropTypes from 'prop-types';
import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import { IconShieldCheck } from '@tabler/icons-react';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';

import BlockchainStatusChip from './BlockchainStatusChip';

function HashRow({ label, value }) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontFamily="monospace">
        {value}
      </Typography>
    </Stack>
  );
}

HashRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired
};

function VerificationEntry({ verification }) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5
      }}
    >
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <BlockchainStatusChip kind="verification" value={verification.result} />
          <Typography variant="caption" color="text.secondary">
            {verification.verificationType}
          </Typography>
        </Stack>
        <Typography variant="body2">
          Verified: <MalaysiaTime time={verification.verifiedAt} />
        </Typography>
        {verification.verifiedByUser ? (
          <Typography variant="body2">By: {verification.verifiedByUser.name}</Typography>
        ) : null}
        <HashRow label="Stored hash" value={verification.storedHashShort} />
        <HashRow label="Recomputed hash" value={verification.recomputedHashShort} />
        <HashRow label="On-chain hash" value={verification.onchainHashShort} />
        <Typography variant="body2">On-chain found: {verification.onchainFound ? 'Yes' : 'No'}</Typography>
        {verification.errorMessage ? (
          <Typography variant="body2" color="error.main">
            {verification.errorMessage}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

VerificationEntry.propTypes = {
  verification: PropTypes.object.isRequired
};

export default function BlockchainVerificationPanel({
  latestVerification,
  verifications = [],
  canVerify,
  verifying,
  onVerify
}) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 2
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        <Typography variant="h6">Verification</Typography>
        {canVerify ? (
          <Button
            variant="contained"
            size="small"
            startIcon={<IconShieldCheck size={18} />}
            onClick={onVerify}
            disabled={verifying}
          >
            {verifying ? 'Verifying…' : 'Run verification'}
          </Button>
        ) : null}
      </Stack>

      {latestVerification ? (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="subtitle2">Latest result</Typography>
          <VerificationEntry verification={latestVerification} />
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No verification has been run for this record yet.
        </Typography>
      )}

      {verifications.length > 1 ? (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            History
          </Typography>
          <Stack spacing={1}>
            {verifications.slice(1).map((verification) => (
              <VerificationEntry key={verification.id} verification={verification} />
            ))}
          </Stack>
        </>
      ) : null}
    </Box>
  );
}

BlockchainVerificationPanel.propTypes = {
  latestVerification: PropTypes.object,
  verifications: PropTypes.arrayOf(PropTypes.object),
  canVerify: PropTypes.bool,
  verifying: PropTypes.bool,
  onVerify: PropTypes.func
};
