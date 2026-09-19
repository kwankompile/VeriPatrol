import { alpha, Box, styled, Typography } from '@mui/material';

const Header = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.5),
  marginBottom: theme.spacing(2.5)
  // marginTop: theme.spacing(3)
}));

const Title = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  letterSpacing: 1.2,
  fontSize: '0.85rem',
  background: `linear-gradient(135deg, ${theme.palette.secondary.main} 100%, ${theme.palette.secondary.light} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text'
}));

const Divider = styled(Box)(({ theme }) => ({
  flex: 1,
  height: 2,
  background: `linear-gradient(90deg, ${alpha(theme.palette.secondary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.3)}, ${alpha(theme.palette.secondary.main, 0.1)})`,
  borderRadius: 2
}));

export function SectionHeader({ title }) {
  return (
    // <div className="flex items-center gap-2 mb-3">
    //    {Icon && <Icon size={20} className="text-blue-600" />}
    //    <span className="text-lg font-semibold">{title}</span>
    // </div>

    <Header>
      {/* <User size={20} color={theme.palette.secondary.main} /> */}
      <Title variant="overline">{title}</Title>
      <Divider />
    </Header>
  );
}
