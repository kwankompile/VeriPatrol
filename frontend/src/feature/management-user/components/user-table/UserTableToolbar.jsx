import { Box, Button, TextField, useTheme, useMediaQuery } from '@mui/material';
import { IconPlus as AddIcon } from '@tabler/icons-react';

export const UserTableToolbar = ({ filterText, onFilterChange, onAddUser }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        mb: 2,
        gap: 2
      }}
    >
      <TextField
        id="filter-input"
        label={isMobile ? 'Search...' : 'Filter'}
        type="text"
        size="small"
        sx={{
          width: { xs: '100%', sm: 250 },
          minWidth: { xs: '100%', sm: 250 }
        }}
        value={filterText}
        onChange={(e) => onFilterChange(e.target.value)}
      />
      <Button
        variant="contained"
        color="secondary"
        startIcon={<AddIcon size={18} />}
        onClick={onAddUser}
        sx={{
          width: { xs: '100%', sm: 'auto' },
          minWidth: { xs: '100%', sm: 'auto' },
          px: { xs: 2, sm: 3 }
        }}
      >
        Add New User
      </Button>
    </Box>
  );
};
