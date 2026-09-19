import Chip from '@mui/material/Chip';

const CONFIG = {
  outdoor: { label: 'Outdoor', color: 'primary' },
  indoor: { label: 'Indoor', color: 'info' }
};

export default function CheckpointLocationTypeChip({ locationType }) {
  const key = locationType?.toLowerCase();
  const cfg = CONFIG[key] ?? { label: locationType || 'Unknown', color: 'default' };
  return <Chip label={cfg.label} color={cfg.color} size="small" variant="outlined" />;
}
