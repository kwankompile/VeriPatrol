// React hooks for state management and lifecycle control
import { useState, useEffect } from 'react';

// React Router hook for programmatic navigation
import { useNavigate } from 'react-router-dom';

import {
  buildUserPayload,
  extractBackendErrorMessage,
  extractBackendValidationErrors,
  mapRolesToOptions,
  normalizeValidationErrorsForForm,
  validateUserForm
} from '../utils/userValidation';

/**
 * Custom controller hook for User Management
 * Acts as the business-logic layer between UI components and the repository (API layer)
 */
export const useUserController = (repository) => {
  // Router navigation instance
  const navigate = useNavigate();

  // Stores the full list of users fetched from backend
  const [users, setUsers] = useState([]);

  // Current page index for pagination
  const [page, setPage] = useState(0);

  // Number of rows displayed per page
  const [rowsPerPage, setRowsPerPage] = useState(5);

  // Text used for filtering/searching users
  const [filterText, setFilterText] = useState('');

  // Loading state to control UI feedback (spinners, disabled buttons, etc.)
  const [loading, setLoading] = useState(true);

  // Right-side drawer (add/edit) state — mirrors Camera Management UX
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formUser, setFormUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [roleOptions, setRoleOptions] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  /**
   * Load users once when the component using this hook is mounted
   */
  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

  /**
   * Fetch selectable roles for the add/edit drawer
   */
  const loadRoles = async () => {
    try {
      setRolesLoading(true);
      const response = await repository.getRoles();
      setRoleOptions(mapRolesToOptions(repository.normalizeRolesList(response)));
    } catch (error) {
      console.error('Failed to load roles:', error);
    } finally {
      setRolesLoading(false);
    }
  };

  /**
   * Fetch all users from the repository (API)
   * Handles loading state and error safety
   */
  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await repository.getAllUsers();
      setUsers(data.data); // API response structure { data: [...] }
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle page change event from pagination component
   */
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  /**
   * Handle change in number of rows per page
   * Resets page to 0 to avoid invalid page index
   */
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  /**
   * Handle filter/search text change
   * Resets pagination to first page
   */
  const handleFilterChange = (text) => {
    setFilterText(text);
    setPage(0);
  };

  /**
   * Navigation handlers for CRUD operations
   */
  const handleAddUser = () => {
    setFormMode('create');
    setFormUser(null);
    setFormErrors({});
    setFormOpen(true);
  };

  const handleViewUser = (userId) => {
    navigate(`/admin/management-user/view/${userId}`);
  };

  const handleEditUser = async (userId) => {
    setFormErrors({});
    setFormMode('edit');

    const existing = users.find((user) => user.id === userId) ?? null;
    setFormUser(existing);
    setFormOpen(true);

    try {
      const response = await repository.getUserById(userId);
      const user = repository.normalizeUser(response);
      if (user) {
        setFormUser(user);
      }
    } catch (error) {
      console.error('Failed to load user for editing:', error);
    }
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setFormUser(null);
    setFormErrors({});
  };

  const handleSaveUser = async (form) => {
    const isEdit = formMode === 'edit';
    const { errors: validationErrors, isValid } = validateUserForm(form, { requirePassword: !isEdit });
    if (!isValid) {
      setFormErrors(validationErrors);
      return;
    }

    try {
      setSaving(true);
      setFormErrors({});
      const payload = buildUserPayload(form, { includePassword: true });

      if (isEdit && formUser?.id) {
        await repository.updateUser(formUser.id, payload);
        setFeedback({ type: 'success', message: 'User updated successfully.' });
      } else {
        await repository.createUser(payload);
        setFeedback({ type: 'success', message: 'User created successfully.' });
      }

      setFormOpen(false);
      setFormUser(null);
      await loadUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
      const backendErrors = extractBackendValidationErrors(error);
      if (backendErrors) {
        setFormErrors(normalizeValidationErrorsForForm(backendErrors));
      }
      setFeedback({ type: 'error', message: extractBackendErrorMessage(error, 'Failed to save user.') });
    } finally {
      setSaving(false);
    }
  };

  const clearFeedback = () => {
    setFeedback({ type: '', message: '' });
  };

  /**
   * Delete user after confirmation
   * Reloads user list upon success
   */
  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await repository.deleteUser(userId);
        await loadUsers();
      } catch (error) {
        console.error('Failed to delete user:', error);
        alert('Failed to delete user');
      }
    }
  };

  /**
   * Derived data:
   * - Apply filtering
   * - Apply pagination
   * These are intentionally computed here to keep UI components dumb
   */
  const filteredUsers = repository.filterUsers(users, filterText);
  const paginatedUsers = repository.paginateUsers(filteredUsers, page, rowsPerPage);

  /**
   * Expose only what the UI layer needs
   * This enforces separation of concerns
   */
  return {
    users: paginatedUsers,
    filteredCount: filteredUsers.length,
    page,
    rowsPerPage,
    filterText,
    loading,
    formOpen,
    formMode,
    formUser,
    saving,
    formErrors,
    roleOptions,
    rolesLoading,
    feedback,
    handleChangePage,
    handleChangeRowsPerPage,
    handleFilterChange,
    handleAddUser,
    handleViewUser,
    handleEditUser,
    handleCloseForm,
    handleSaveUser,
    handleDeleteUser,
    clearFeedback
  };
};
