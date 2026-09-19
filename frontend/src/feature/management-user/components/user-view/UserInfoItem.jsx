import { Box, Typography } from '@mui/material';
import { InfoCard } from '../../styles/InfoContainer';
import { IconWrapper } from '../../styles/IconStyle';

export default function InfoItem({ icon, label, value, isMobile }) {
  return (
    <InfoCard>
      {!isMobile && <IconWrapper>{icon}</IconWrapper>}

      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          {value}
        </Typography>
      </Box>
    </InfoCard>
  );
}
