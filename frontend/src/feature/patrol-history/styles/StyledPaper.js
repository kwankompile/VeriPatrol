import { styled, Paper } from '@mui/material';

export const StyledPaper = styled(Paper)(({ theme }) => ({
  backgroundColor: '#fff',
  padding: theme.spacing(3),
  borderRadius: 12,
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  border: '1px solid',
  borderColor: theme.vars.palette.divider,
  transition: '0.3s ease',
  '&:hover': {
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    transform: 'translateY(-2px)'
  },
  ...theme.applyStyles('dark', {
    backgroundColor: '#1e1e1e',
    borderColor: 'rgba(255,255,255,0.1)'
  })
}));
