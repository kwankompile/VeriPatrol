import { Box, Button, MenuItem, TextField, useMediaQuery, useTheme } from '@mui/material';
import { IconPlus as AddIcon } from '@tabler/icons-react';

import { LOCATION_TYPES } from '../../utils/checkpointConstants';

export function CheckpointTableToolbar({
  filterText,
  zoneFilter,
  activeFilter,
  locationTypeFilter,
  zones,
  hideZoneFilter = false,
  onFilterChange,
  onZoneFilterChange,
  onActiveFilterChange,
  onLocationTypeFilterChange,
  onAddCheckpoint
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', md: 'flex-end' },
        mb: 2,
        gap: 2,
        flexWrap: 'wrap'
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, flex: 1 }}>
        <TextField
          label={isMobile ? 'Search name' : 'Search by name'}
          size="small"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 200 } }}
        />
        {!hideZoneFilter ? (
          <TextField
            select
            label="Zone"
            size="small"
            value={zoneFilter}
            onChange={(e) => onZoneFilterChange(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 160 } }}
          >
            <MenuItem value="">All zones</MenuItem>
            {zones.map((zone) => (
              <MenuItem key={zone.id} value={zone.id}>
                {zone.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        <TextField
          select
          label="Status"
          size="small"
          value={activeFilter}
          onChange={(e) => onActiveFilterChange(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 130 } }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Active</MenuItem>
          <MenuItem value="false">Inactive</MenuItem>
        </TextField>
        <TextField
          select
          label="Location type"
          size="small"
          value={locationTypeFilter}
          onChange={(e) => onLocationTypeFilterChange(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 150 } }}
        >
          <MenuItem value="">All types</MenuItem>
          {LOCATION_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Button variant="contained" color="secondary" startIcon={<AddIcon size={18} />} onClick={onAddCheckpoint}>
        Create checkpoint
      </Button>
    </Box>
  );
}
