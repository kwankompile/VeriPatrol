import { styled, Box } from '@mui/material';

export const InfoCard = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(2),
  padding: theme.spacing(2.5),
  borderRadius: 12,
  border: '2px solid',
  borderColor: theme.vars.palette.divider,
  backgroundColor: theme.vars.palette.background.default,
  transition: '0.2s ease',
  '&:hover': {
    backgroundColor: theme.vars.palette.action.hover,
    borderColor: theme.vars.palette.secondary.main
  }
}));
