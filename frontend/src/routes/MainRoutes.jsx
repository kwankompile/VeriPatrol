import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

// project imports
import MainLayout from 'layout/MainLayout';
import Loadable from 'ui-component/Loadable';
import ProtectedRoute from './guards/ProtectedRoute';
import RoleProtectedRoute from './guards/RoleProtectedRoute';
import RoleHomeRedirect from './guards/RoleHomeRedirect';
import ErrorBoundary from './ErrorBoundary';
import { ALL_ROLES, ROLES } from 'utils/auth';

// dashboard routing
const DashboardDefault = Loadable(lazy(() => import('views/dashboard/Default')));

// guard routing
const GuardPatrol = Loadable(lazy(() => import('../feature/patrol/views/PartrolHome')));

// operator routing
const OperatorPatrolLiveTracking = Loadable(lazy(() => import('../feature/patrol-live-tracking/views/PatrolLiveList')));
const OperatorPatrolHistory = Loadable(lazy(() => import('../feature/patrol-history/views/PatrolHistoryList')));
const OperatorPatrolHistoryView = Loadable(lazy(() => import('../feature/patrol-history/views/PatrolHistoryView')));

// admin routing
const AdminUserManagement = Loadable(lazy(() => import('../feature/management-user/views/UserList')));
const AdminUserManagementView = Loadable(lazy(() => import('../feature/management-user/views/UserView')));
const AdminUserManagementAdd = Loadable(lazy(() => import('../feature/management-user/views/UserAdd')));
const AdminUserManagementEdit = Loadable(lazy(() => import('../feature/management-user/views/UserEdit')));

const AdminZoneManagement = Loadable(lazy(() => import('../feature/management-zone/views/ZoneList')));
const AdminZoneManagementAdd = Loadable(lazy(() => import('../feature/management-zone/views/ZoneAdd')));
const AdminZoneManagementEdit = Loadable(lazy(() => import('../feature/management-zone/views/ZoneEdit')));

const AdminCheckpointManagement = Loadable(lazy(() => import('../feature/management-checkpoint/views/CheckpointList')));
const AdminCheckpointManagementCreate = Loadable(lazy(() => import('../feature/management-checkpoint/views/CheckpointCreate')));
const AdminCheckpointManagementView = Loadable(lazy(() => import('../feature/management-checkpoint/views/CheckpointView')));
const AdminCheckpointManagementEdit = Loadable(lazy(() => import('../feature/management-checkpoint/views/CheckpointEdit')));

const AdminPatrolMonitoring = Loadable(lazy(() => import('../feature/patrol-monitoring/views/PatrolMonitoringDashboard')));
const AdminPatrolSessionDetail = Loadable(lazy(() => import('../feature/patrol-monitoring/views/PatrolSessionDetail')));

const AdminAnprMonitoring = Loadable(lazy(() => import('../feature/anpr-monitoring/views/AnprEventList')));
const AdminAnprEventDetail = Loadable(lazy(() => import('../feature/anpr-monitoring/views/AnprEventDetail')));

const AdminBlockchainMonitoring = Loadable(lazy(() => import('../feature/blockchain-monitoring/views/BlockchainDashboard')));
const AdminBlockchainRecordDetail = Loadable(lazy(() => import('../feature/blockchain-monitoring/views/BlockchainRecordDetail')));
const AdminAuthMonitoring = Loadable(lazy(() => import('../feature/auth-monitoring/views/AuthMonitoringDashboard')));
const AccountSecurity = Loadable(lazy(() => import('../feature/account-security/views/AccountSecurityPage')));
const ProfilePage = Loadable(lazy(() => import('../feature/profile/views/ProfilePage')));

const AdminVehicleManagement = Loadable(lazy(() => import('../feature/management-vehicle/views/VehicleList')));
const AdminVehicleManagementView = Loadable(lazy(() => import('../feature/management-vehicle/views/VehicleDetail')));
const AdminCameraManagement = Loadable(lazy(() => import('../feature/management-camera/views/CameraList')));

const Forbidden = Loadable(lazy(() => import('views/errors/Forbidden')));

// utilities routing
const UtilsTypography = Loadable(lazy(() => import('views/utilities/Typography')));
const UtilsColor = Loadable(lazy(() => import('views/utilities/Color')));
const UtilsShadow = Loadable(lazy(() => import('views/utilities/Shadow')));

// sample page routing
const SamplePage = Loadable(lazy(() => import('views/sample-page')));

const adminOnly = (element) => <RoleProtectedRoute allowedRoles={[ROLES.ADMIN]}>{element}</RoleProtectedRoute>;
const adminOrOperator = (element) => (
  <RoleProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.SECURITY_OPERATOR]}>{element}</RoleProtectedRoute>
);
const allRoles = (element) => <RoleProtectedRoute allowedRoles={ALL_ROLES}>{element}</RoleProtectedRoute>;

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: (
    <ProtectedRoute>
      <MainLayout />
    </ProtectedRoute>
  ),
  errorElement: <ErrorBoundary />,
  children: [
    {
      index: true,
      element: <RoleHomeRedirect />
    },
    {
      path: 'forbidden',
      element: <Forbidden />
    },
    {
      path: 'dashboard',
      element: allRoles(<DashboardDefault />)
    },

    // ----------------- GUARD ROUTES ----------------- //

    {
      path: 'patrol',
      element: allRoles(<GuardPatrol />)
    },
    {
      path: 'account/security',
      element: allRoles(<AccountSecurity />)
    },
    {
      path: 'account/profile',
      element: allRoles(<ProfilePage />)
    },
    {
      path: 'guard/patrol',
      element: <Navigate to="/patrol" replace />
    },

    // ----------------- OPERATOR ROUTES (admin only) ----------------- //

    {
      path: 'operator/patrol/live-tracking',
      element: adminOnly(<OperatorPatrolLiveTracking />)
    },
    {
      path: 'operator/patrol/history',
      element: adminOnly(<OperatorPatrolHistory />)
    },
    {
      path: 'operator/patrol/history/view/:patrolHistoryId',
      element: adminOnly(<OperatorPatrolHistoryView />)
    },

    // =================== ADMIN ROUTES =================== //

    {
      path: 'admin/management-user',
      element: adminOnly(<AdminUserManagement />)
    },
    {
      path: 'admin/management-user/view/:userId',
      element: adminOnly(<AdminUserManagementView />)
    },
    {
      path: 'admin/management-user/add',
      element: adminOnly(<AdminUserManagementAdd />)
    },
    {
      path: 'admin/management-user/edit/:userId',
      element: adminOnly(<AdminUserManagementEdit />)
    },
    {
      path: 'admin/management-zone',
      element: adminOnly(<AdminZoneManagement />)
    },
    {
      path: 'admin/management-zone/add',
      element: adminOnly(<AdminZoneManagementAdd />)
    },
    {
      path: 'admin/management-zone/edit/:zoneId',
      element: adminOnly(<AdminZoneManagementEdit />)
    },
    {
      path: 'admin/management-zone/view/:zoneId',
      element: adminOnly(<AdminCheckpointManagement />)
    },
    {
      path: 'admin/management-checkpoint',
      element: adminOnly(<AdminCheckpointManagement />)
    },
    {
      path: 'admin/management-checkpoint/create',
      element: adminOnly(<AdminCheckpointManagementCreate />)
    },
    {
      path: 'admin/management-checkpoint/:checkpointId/edit',
      element: adminOnly(<AdminCheckpointManagementEdit />)
    },
    {
      path: 'admin/management-checkpoint/:checkpointId',
      element: adminOnly(<AdminCheckpointManagementView />)
    },
    {
      path: 'admin/patrol-monitoring',
      element: adminOrOperator(<AdminPatrolMonitoring />)
    },
    {
      path: 'admin/patrol-monitoring/:patrolSessionId',
      element: adminOrOperator(<AdminPatrolSessionDetail />)
    },
    {
      path: 'admin/anpr-monitoring',
      element: adminOrOperator(<AdminAnprMonitoring />)
    },
    {
      path: 'admin/anpr-monitoring/:anprEventId',
      element: adminOrOperator(<AdminAnprEventDetail />)
    },
    {
      path: 'admin/blockchain-monitoring',
      element: adminOnly(<AdminBlockchainMonitoring />)
    },
    {
      path: 'admin/blockchain-monitoring/:blockchainRecordId',
      element: adminOnly(<AdminBlockchainRecordDetail />)
    },
    {
      path: 'admin/auth-monitoring',
      element: adminOnly(<AdminAuthMonitoring />)
    },
    {
      path: 'admin/management-vehicle',
      element: adminOnly(<AdminVehicleManagement />)
    },
    {
      path: 'admin/management-vehicle/view/:vehicleId',
      element: adminOnly(<AdminVehicleManagementView />)
    },
    {
      path: 'admin/management-camera',
      element: adminOnly(<AdminCameraManagement />)
    },

    {
      path: 'typography',
      element: adminOnly(<UtilsTypography />)
    },
    {
      path: 'color',
      element: adminOnly(<UtilsColor />)
    },
    {
      path: 'shadow',
      element: adminOnly(<UtilsShadow />)
    },
    {
      path: '/sample-page',
      element: adminOnly(<SamplePage />)
    }
  ]
};

export default MainRoutes;
