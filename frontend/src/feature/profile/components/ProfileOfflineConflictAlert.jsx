import { Alert, Box, Button, Stack, Typography } from '@mui/material';

import { normalizeContactValue } from '../utils/profileValidation';

/**
 * @param {{
 *   queueItem: import('../offline/profileOfflineQueue').ProfileOfflineQueueItem;
 *   resolving?: boolean;
 *   onKeepServer: () => void | Promise<void>;
 *   onReapply: () => void | Promise<void>;
 * }} props
 */
export default function ProfileOfflineConflictAlert({ queueItem, resolving = false, onKeepServer, onReapply }) {
  const serverPhone = normalizeContactValue(queueItem.serverValues?.phone ?? queueItem.serverProfile?.phone);
  const serverAddress = normalizeContactValue(queueItem.serverValues?.address ?? queueItem.serverProfile?.address);
  const localPhone = normalizeContactValue(queueItem.localValues?.phone);
  const localAddress = normalizeContactValue(queueItem.localValues?.address);

  return (
    <Alert severity="warning">
      <Stack spacing={2}>
        <Typography variant="body2">Your offline profile update could not be applied because the profile changed elsewhere.</Typography>

        <Box>
          <Typography variant="subtitle2">Server value</Typography>
          <Typography variant="body2">Phone: {serverPhone || '—'}</Typography>
          <Typography variant="body2">Address: {serverAddress || '—'}</Typography>
        </Box>

        <Box>
          <Typography variant="subtitle2">Your pending offline value</Typography>
          <Typography variant="body2">Phone: {localPhone || '—'}</Typography>
          <Typography variant="body2">Address: {localAddress || '—'}</Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" onClick={() => void onKeepServer()} disabled={resolving}>
            Keep server version
          </Button>
          <Button variant="contained" onClick={() => void onReapply()} disabled={resolving}>
            {resolving ? 'Reapplying…' : 'Reapply my changes'}
          </Button>
        </Stack>
      </Stack>
    </Alert>
  );
}
