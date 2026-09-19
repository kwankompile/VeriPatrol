import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import { IconAt, IconEdit, IconMapPin, IconPhone } from '@tabler/icons-react';

import SettingsCard from './settings/SettingsCard';
import { formatOrFallback } from '../utils/profileFormatters';

function ContactRow({ icon, label, value }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        aria-hidden
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 2,
          flexShrink: 0,
          color: theme.palette.secondary.main,
          bgcolor: alpha(theme.palette.secondary.main, 0.1)
        })}
      >
        {icon}
      </Box>
      <Stack spacing={0.1} sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
          {value}
        </Typography>
      </Stack>
    </Stack>
  );
}

ContactRow.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string,
  value: PropTypes.node
};

/**
 * Read-only Contact Information (Email, Phone, Address) with an Edit action at
 * the bottom that opens the editing modal.
 *
 * @param {{
 *   profile: import('../repositories/ProfileRepository').NormalizedProfileUser;
 *   onEdit: () => void;
 * }} props
 */
export default function ProfileContactCard({ profile, onEdit }) {
  return (
    <SettingsCard title="Contact Information" subtitle="How the team can reach you" icon={<IconPhone size={20} />}>
      <Stack spacing={2.5} data-testid="profile-contact-card">
        <Stack spacing={2}>
          <ContactRow icon={<IconAt size={18} />} label="Email" value={formatOrFallback(profile.email)} />
          <ContactRow icon={<IconPhone size={18} />} label="Phone number" value={formatOrFallback(profile.phone)} />
          <ContactRow icon={<IconMapPin size={18} />} label="Address" value={formatOrFallback(profile.address)} />
        </Stack>

        <Divider sx={{ borderColor: 'divider' }} />

        <Stack direction="row" justifyContent="flex-end">
          <Button
            variant="contained"
            color="secondary"
            startIcon={<IconEdit size={16} />}
            onClick={onEdit}
            data-testid="profile-contact-edit"
          >
            Edit
          </Button>
        </Stack>
      </Stack>
    </SettingsCard>
  );
}

ProfileContactCard.propTypes = {
  profile: PropTypes.object.isRequired,
  onEdit: PropTypes.func
};
