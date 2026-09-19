import { useNavigate } from 'react-router-dom';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import MainCard from 'ui-component/cards/MainCard';
import { getAuthUserRole, getDefaultRouteForRole } from 'utils/auth';

export default function Forbidden() {
  const navigate = useNavigate();
  const role = getAuthUserRole();

  const handleGoHome = () => {
    navigate(getDefaultRouteForRole(role), { replace: true });
  };

  return (
    <MainCard title="403 Forbidden">
      <Stack spacing={2} sx={{ py: 2 }}>
        <Typography variant="h4" color="error">
          403 Forbidden
        </Typography>
        <Typography variant="body1" color="text.secondary">
          You do not have permission to access this page.
        </Typography>
        <Button variant="contained" onClick={handleGoHome}>
          Go to my home page
        </Button>
      </Stack>
    </MainCard>
  );
}
