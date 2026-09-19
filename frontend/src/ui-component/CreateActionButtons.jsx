import { alpha, Box, Button, CircularProgress, useTheme } from '@mui/material';
import { IconDeviceFloppy as SaveIcon } from '@tabler/icons-react';

export function SubmitButton({ text1, text2, controller }) {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
      <Button
        type="submit"
        variant="contained"
        disabled={controller.loading || controller.noZones}
        startIcon={controller.loading ? <CircularProgress size={18} /> : <SaveIcon size={18} />}
        sx={{
          borderRadius: 2,
          px: 4,
          textTransform: 'none',
          fontWeight: 600,
          background: `linear-gradient(135deg, ${theme.palette.secondary.main} 100%, ${theme.palette.secondary.dark} 100%)`,
          boxShadow: `0 4px 12px ${alpha(theme.palette.secondary.main, 0.4)}`,
          '&:hover': {
            boxShadow: `0 6px 20px ${alpha(theme.palette.secondary.main, 0.6)}`,
            transform: 'translateY(-2px)'
          }
        }}
      >
        {controller.loading ? text2 : text1}
      </Button>
    </Box>
  );
}
