import Chip from '@mui/material/Chip';

export default function CheckpointStatusChip({ isActive }) {
  if (isActive) {
    return <Chip label="Active" color="success" size="small" variant="filled" />;
  }
  return <Chip label="Inactive" color="default" size="small" variant="filled" />;
}
