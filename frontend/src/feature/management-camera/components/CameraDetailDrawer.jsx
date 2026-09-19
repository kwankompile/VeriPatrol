import PropTypes from 'prop-types';
import { Button, Divider, Drawer, Stack, TextField, Typography } from '@mui/material';

import CameraStatusChip from './CameraStatusChip';

function DetailRow({ label, value }) {
  return (
    <TextField label={label} value={value ?? '—'} disabled fullWidth size="small" />
  );
}

DetailRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export default function CameraDetailDrawer({ open, camera, onClose, onEdit, onDelete }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, p: 3 } }}>
      <Typography variant="h4" gutterBottom>
        Camera details
      </Typography>

      {camera ? (
        <Stack spacing={2}>
          <DetailRow label="Camera ID" value={camera.id} />
          <DetailRow label="Name" value={camera.name} />
          <DetailRow label="Email" value={camera.email} />
          <DetailRow label="Location" value={camera.location} />

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <CameraStatusChip kind="credential" value={camera.credentialEnabled} />
            <CameraStatusChip kind="active" value={camera.isActive} />
            <CameraStatusChip
              kind="operational"
              value={{ label: camera.operationalStatusLabel, color: camera.operationalStatusColor }}
            />
          </Stack>

          <Divider />

          <Typography variant="subtitle1">Connectivity (read-only)</Typography>
          <DetailRow label="Reported RTSP URL (masked)" value={camera.rtspUrlMasked} />
          <DetailRow label="RTSP reported at" value={camera.formattedRtspReportedAt} />
          <DetailRow label="Last login" value={camera.formattedLastLoginAt} />
          <DetailRow label="Last seen" value={camera.formattedLastSeenAt} />
          <DetailRow label="Credential rotated at" value={camera.formattedCredentialRotatedAt} />

          <Divider />

          <Typography variant="subtitle1">Configuration</Typography>
          <DetailRow label="Resolution" value={camera.formattedResolution} />
          <DetailRow label="Coordinates" value={camera.formattedCoordinates} />

          <Divider />

          <Typography variant="subtitle1">Audit</Typography>
          <DetailRow label="Created at" value={camera.formattedCreatedAt} />
          <DetailRow label="Updated at" value={camera.formattedUpdatedAt} />

          <Typography variant="body2" color="text.secondary">
            Recent ANPR event count: Not available
          </Typography>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {onDelete ? (
              <Button color="error" variant="outlined" onClick={() => onDelete(camera)}>
                Delete
              </Button>
            ) : null}
            <Button variant="outlined" onClick={onClose}>
              Close
            </Button>
            {onEdit ? (
              <Button variant="contained" onClick={() => onEdit(camera)}>
                Edit
              </Button>
            ) : null}
          </Stack>
        </Stack>
      ) : null}
    </Drawer>
  );
}

CameraDetailDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  camera: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func
};
