import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { Alert, Box, Button, CircularProgress, Grid } from '@mui/material';
import { IconPencil as EditIcon, IconTrash as DeleteIcon, IconUsers as UsersIcon } from '@tabler/icons-react';

import { UserRepository } from '../repositories/userRepository';
import userService from '../datasources/userService';
import { useUserViewController } from '../controllers/useUserViewController';

import DetailCard from 'ui-component/cards/DetailCard';
import { UserProfileCard, UserContactCard } from '../components';

export default function UserView() {
  const { userId } = useParams();
  const repository = useMemo(() => new UserRepository(userService), []);
  const controller = useUserViewController(repository, userId);

  const headerActions = controller.user ? (
    <>
      <Button variant="contained" color="warning" startIcon={<EditIcon size={18} />} onClick={controller.handleEdit}>
        Edit
      </Button>
      <Button variant="outlined" color="error" startIcon={<DeleteIcon size={18} />} onClick={controller.handleDelete}>
        Delete
      </Button>
    </>
  ) : null;

  if (controller.loading) {
    return (
      <DetailCard title="User Details" avatar={<UsersIcon size={24} />} onBack={controller.handleBack}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={48} thickness={4} />
        </Box>
      </DetailCard>
    );
  }

  if (controller.error) {
    return (
      <DetailCard title="User Details" avatar={<UsersIcon size={24} />} onBack={controller.handleBack}>
        <Alert severity="error">{controller.error}</Alert>
      </DetailCard>
    );
  }

  if (!controller.user) {
    return (
      <DetailCard title="User Details" avatar={<UsersIcon size={24} />} onBack={controller.handleBack}>
        <Alert severity="warning">User not found.</Alert>
      </DetailCard>
    );
  }

  return (
    <DetailCard title="User Details" avatar={<UsersIcon size={24} />} onBack={controller.handleBack} headerActions={headerActions}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <UserProfileCard user={controller.user} />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <UserContactCard user={controller.user} />
        </Grid>
      </Grid>
    </DetailCard>
  );
}
