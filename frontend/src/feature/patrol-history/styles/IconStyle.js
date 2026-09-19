import { styled, Box } from '@mui/material';

export const IconWrapper = styled(Box)(({ theme }) => ({
  width: 40,
  height: 40,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  background: `linear-gradient(135deg,
      ${theme.vars.palette.secondary.main},
      ${theme.vars.palette.secondary.dark}
   )`
}));
