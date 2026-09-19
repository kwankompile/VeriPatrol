import { Alert, Snackbar, useTheme, useMediaQuery } from '@mui/material';

import { UserRepository } from '../repositories/userRepository';
import { useUserController } from '../controllers/useUserController';
import userService from '../datasources/userService';

import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';
import { UserTable, UserTableToolbar, UserFormDrawer } from '../components';

export default function UserList() {
  // Initialize dependencies using dependency injection pattern
  const repository = new UserRepository(userService);
  const controller = useUserController(repository);

  // Responsive design hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <MainCard title="User Management">
      {/* Filtering and action toolbar */}
      <UserTableToolbar
        filterText={controller.filterText}
        onFilterChange={controller.handleFilterChange}
        onAddUser={controller.handleAddUser}
      />

      {/* Main table displaying user data — skeleton renders inside the table body only */}
      <UserTable
        users={controller.users}
        page={controller.page}
        rowsPerPage={controller.rowsPerPage}
        loading={controller.loading}
        onView={controller.handleViewUser}
        onEdit={controller.handleEditUser}
        onDelete={controller.handleDeleteUser}
      />

      {/* Pagination and rows per page controls */}
      <PaginationFooter
        page={controller.page}
        rowsPerPage={controller.rowsPerPage}
        filteredCount={controller.filteredCount}
        onPageChange={controller.handleChangePage}
        onRowsPerPageChange={controller.handleChangeRowsPerPage}
        isMobile={isMobile}
      />

      <UserFormDrawer
        open={controller.formOpen}
        mode={controller.formMode}
        user={controller.formUser}
        roleOptions={controller.roleOptions}
        rolesLoading={controller.rolesLoading}
        saving={controller.saving}
        errors={controller.formErrors}
        onClose={controller.handleCloseForm}
        onSave={controller.handleSaveUser}
      />

      <Snackbar
        open={Boolean(controller.feedback.message)}
        autoHideDuration={4000}
        onClose={controller.clearFeedback}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={controller.clearFeedback} severity={controller.feedback.type || 'info'} sx={{ width: '100%' }}>
          {controller.feedback.message}
        </Alert>
      </Snackbar>
    </MainCard>
  );
}
