import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Avatar, Box, Chip, Stack, Typography } from '@mui/material';
import { IconCar, IconPhoto } from '@tabler/icons-react';

import ContentEmptyState from 'ui-component/state/ContentEmptyState';
import { getAuthToken } from 'utils/auth';
import { anprStatusMeta, formatConfidence, formatDashboardTimestamp, formatVehicleType } from '../utils/dashboardFormatters';

const PROTECTED_FILE_PATTERN = /\/anpr-images\/[^/]+\/file(?:\?|$)/i;

function AnprThumbnail({ url, alt }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(!url);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setSrc(null);
    setFailed(!url);

    if (!url) return undefined;

    if (!PROTECTED_FILE_PATTERN.test(url)) {
      setSrc(url);
      return undefined;
    }

    const token = getAuthToken();
    fetch(url, { headers: { Accept: 'image/*,*/*', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      .then((response) => {
        if (!response.ok) throw new Error('thumbnail unavailable');
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <Avatar
      variant="rounded"
      src={src ?? undefined}
      alt={alt}
      sx={{ width: 48, height: 40, bgcolor: 'grey.100', color: 'text.disabled' }}
    >
      {failed || !src ? <IconPhoto size={18} /> : null}
    </Avatar>
  );
}

AnprThumbnail.propTypes = {
  url: PropTypes.string,
  alt: PropTypes.string
};

export default function DashboardRecentAnprList({ events, timezone }) {
  if (!events?.length) {
    return (
      <ContentEmptyState
        title="No recent detections"
        message="ANPR events will appear here when cameras report plate reads."
        testId="dashboard-anpr-empty"
      />
    );
  }

  return (
    <Stack spacing={1} data-testid="dashboard-anpr-list">
      {events.map((event) => {
        const status = anprStatusMeta(event.status);
        const vehicleType = formatVehicleType(event.vehicleType);
        return (
          <Stack
            key={event.id}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
              p: 1,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              transition: 'background-color 0.15s ease',
              '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            <AnprThumbnail url={event.plateImageUrl} alt={`Plate ${event.plateNumber}`} />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.5 }} noWrap>
                  {event.plateNumber}
                </Typography>
                {vehicleType ? (
                  <Chip size="small" variant="outlined" icon={<IconCar size={13} />} label={vehicleType} />
                ) : null}
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {event.cameraName} · {formatDashboardTimestamp(event.detectionTime, timezone)}
              </Typography>
            </Box>
            <Stack spacing={0.5} alignItems="flex-end">
              <Chip size="small" color={status.color} label={status.label} />
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}

DashboardRecentAnprList.propTypes = {
  events: PropTypes.array,
  timezone: PropTypes.string
};
