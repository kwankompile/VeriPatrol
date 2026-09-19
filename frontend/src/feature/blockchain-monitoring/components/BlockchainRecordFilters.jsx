import PropTypes from 'prop-types';
import { FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';

export default function BlockchainRecordFilters({
  filters,
  onSearchChange,
  onStatusChange,
  onNetworkChange,
  onEnvironmentChange,
  onEntityTypeChange
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
      <TextField
        size="small"
        label="Search hash or entity ID"
        value={filters.search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{ minWidth: { sm: 220 }, flex: 1 }}
      />
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>Status</InputLabel>
        <Select label="Status" value={filters.status} onChange={(e) => onStatusChange(e.target.value)}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="queued">Queued</MenuItem>
          <MenuItem value="processing">Processing</MenuItem>
          <MenuItem value="submitted">Submitted</MenuItem>
          <MenuItem value="confirmed">Confirmed</MenuItem>
          <MenuItem value="failed">Failed</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>Network</InputLabel>
        <Select label="Network" value={filters.network} onChange={(e) => onNetworkChange(e.target.value)}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="ganache">Ganache</MenuItem>
          <MenuItem value="sepolia">Sepolia</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>Environment</InputLabel>
        <Select label="Environment" value={filters.environment} onChange={(e) => onEnvironmentChange(e.target.value)}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="local">Local</MenuItem>
          <MenuItem value="staging">Staging</MenuItem>
          <MenuItem value="production">Production</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>Entity type</InputLabel>
        <Select label="Entity type" value={filters.entityType} onChange={(e) => onEntityTypeChange(e.target.value)}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="anpr_event">ANPR Event</MenuItem>
          <MenuItem value="anpr_image">ANPR Image</MenuItem>
          <MenuItem value="patrol_session">Patrol Session</MenuItem>
          <MenuItem value="user_profile">User Profile</MenuItem>
        </Select>
      </FormControl>
    </Stack>
  );
}

BlockchainRecordFilters.propTypes = {
  filters: PropTypes.shape({
    search: PropTypes.string,
    status: PropTypes.string,
    network: PropTypes.string,
    environment: PropTypes.string,
    entityType: PropTypes.string
  }).isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onStatusChange: PropTypes.func.isRequired,
  onNetworkChange: PropTypes.func.isRequired,
  onEnvironmentChange: PropTypes.func.isRequired,
  onEntityTypeChange: PropTypes.func.isRequired
};
