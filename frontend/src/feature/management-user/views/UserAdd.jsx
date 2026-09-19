import { useMemo } from 'react';
import { Alert, Box, CircularProgress, Grid } from '@mui/material';
import { IconUsers as UsersIcon } from '@tabler/icons-react';

import DetailCard from 'ui-component/cards/DetailCard';
import { FieldContainer } from 'ui-component/FieldContainer';
import { SubmitButton } from 'ui-component/CreateActionButtons';
import { SuccessDialog } from 'ui-component/dialogs/SuccessDialog';
import { SelectFieldContainer } from 'ui-component/SelectFieldContainer';
import { SectionHeader } from 'ui-component/SectionHeader';

import { UserRepository } from '../repositories/userRepository';
import userService from '../datasources/userService';
import { useUserAddController } from '../controllers/useUserAddController';

export default function UserAdd() {
  const repository = useMemo(() => new UserRepository(userService), []);
  const controller = useUserAddController(repository);

  if (controller.rolesLoading) {
    return (
      <DetailCard title="Add new User" avatar={<UsersIcon size={24} />} onBack={controller.handleCancel}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </DetailCard>
    );
  }

  return (
    <>
      <DetailCard title="Add new User" avatar={<UsersIcon size={24} />} onBack={controller.handleCancel}>
        <Box sx={{ mx: 'auto' }} component="form" onSubmit={controller.handleSubmit}>
          {controller.submitError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {controller.submitError}
            </Alert>
          ) : null}

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <SectionHeader title="Personal Information" />
              <FieldContainer
                label="Full Name"
                name="name"
                value={controller.formData.name}
                onChange={controller.handleChange('name')}
                error={!!controller.errors.name}
                helperText={controller.errors.name}
                placeholder="Enter full name"
                required
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <SectionHeader title="Role & Permissions" />
              <SelectFieldContainer
                label="User Role"
                name="role_id"
                value={controller.formData.role_id}
                onChange={controller.handleChange('role_id')}
                error={!!controller.errors.role_id}
                helperText={controller.errors.role_id || 'Select the appropriate role'}
                options={controller.roleOptions}
                placeholder="Select a role"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <SectionHeader title="Contact Details" />
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FieldContainer
                    label="Phone Number"
                    name="phone"
                    value={controller.formData.phone}
                    onChange={controller.handleChange('phone')}
                    error={!!controller.errors.phone}
                    helperText={controller.errors.phone}
                    placeholder="60123456789"
                    notRequired
                  />
                  <Box sx={{ mt: 2 }}>
                    <FieldContainer
                      label="Email Address"
                      name="email"
                      type="email"
                      value={controller.formData.email}
                      onChange={controller.handleChange('email')}
                      error={!!controller.errors.email}
                      helperText={controller.errors.email}
                      placeholder="user@example.com"
                      required
                    />
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <FieldContainer
                    label="Home Address"
                    name="address"
                    value={controller.formData.address}
                    onChange={controller.handleChange('address')}
                    error={!!controller.errors.address}
                    helperText={controller.errors.address}
                    multiline
                    minRows={3}
                    maxRows={10}
                    placeholder="Enter complete home address"
                    notRequired
                  />
                </Grid>
              </Grid>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <SectionHeader title="Security" />
              <FieldContainer
                type="password"
                label="Password"
                name="password"
                value={controller.formData.password}
                onChange={controller.handleChange('password')}
                error={!!controller.errors.password}
                helperText={controller.errors.password}
                placeholder="Enter user's password"
                required
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <SubmitButton text1="Create User" text2="Creating..." controller={controller} />
            </Grid>
          </Grid>
        </Box>
      </DetailCard>

      <SuccessDialog controller={controller} msg="User created successfully! Redirecting to user details..." />
    </>
  );
}
