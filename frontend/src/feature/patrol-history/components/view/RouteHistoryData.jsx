import { Paper, styled, Typography } from '@mui/material';
import LeafletMap from '../LeafletMap';

const Title = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  letterSpacing: 1.2,
  fontSize: '0.85rem',
  background: `linear-gradient(135deg, ${theme.palette.secondary.main} 100%, ${theme.palette.secondary.light} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  marginBottom: 20
}));

export function RouteHistoryData({ routeData = [] }) {
  return (
    <>
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Title>Guard Patrol Route</Title>

        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Route Visualization
        </Typography>
        <LeafletMap routeData={routeData} />
      </Paper>
    </>
  );
}
