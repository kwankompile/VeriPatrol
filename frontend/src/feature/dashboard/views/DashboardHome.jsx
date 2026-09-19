import { useRef } from 'react';
import { Box, Chip, Grid, LinearProgress, Stack } from '@mui/material';
import {
  IconActivity,
  IconAlertTriangle,
  IconCamera,
  IconCar,
  IconClipboardList,
  IconDeviceMobile,
  IconLink,
  IconMap2,
  IconRoute,
  IconShieldLock,
  IconUsers
} from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import ContentEmptyState from 'ui-component/state/ContentEmptyState';
import ContentErrorState from 'ui-component/state/ContentErrorState';
import { gridSpacing } from 'store/constant';
import { ROLES } from 'utils/auth';

import dashboardService from '../datasources/dashboardService';
import { DashboardRepository } from '../repositories/DashboardRepository';
import { useDashboardController } from '../controllers/useDashboardController';
import DashboardRoleHeader from '../components/DashboardRoleHeader';
import DashboardMetricCard, { DashboardMetricsSkeleton } from '../components/DashboardMetricCard';
import DashboardSectionCard from '../components/DashboardSectionCard';
import DashboardActionCard from '../components/DashboardActionCard';
import DashboardRecentAnprList from '../components/DashboardRecentAnprList';
import DashboardPatrolList from '../components/DashboardPatrolList';
import DashboardCameraHealth from '../components/DashboardCameraHealth';
import DashboardBlockchainHealth from '../components/DashboardBlockchainHealth';
import DashboardAuthAlerts from '../components/DashboardAuthAlerts';
import DashboardPwaReadiness from '../components/DashboardPwaReadiness';
import DashboardMapPanel from '../components/DashboardMapPanel';
import DashboardGuardPatrolPanel from '../components/DashboardGuardPatrolPanel';

const ACTION_ICONS = {
  'patrol-monitoring': <IconRoute size={18} />,
  'anpr-monitoring': <IconCar size={18} />,
  'camera-management': <IconCamera size={18} />,
  'vehicle-management': <IconCar size={18} />,
  'blockchain-monitoring': <IconLink size={18} />,
  'auth-monitoring': <IconShieldLock size={18} />,
  'user-management': <IconUsers size={18} />
};

function ActivePatrolPanel({ activeCount, locations, timezone }) {
  return (
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <Box sx={{ flexGrow: 1 }}>
        <DashboardMapPanel locations={locations} timezone={timezone} height={300} />
      </Box>
    </Stack>
  );
}

function AdminDashboard({ summary, timezone }) {
  const metrics = summary?.summary ?? {};
  const sections = summary?.sections ?? {};

  return (
    <Stack spacing={gridSpacing} data-testid="dashboard-admin-layout">
      <Grid container spacing={gridSpacing}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <DashboardMetricCard label="Active patrols" value={metrics.activePatrols} icon={<IconRoute size={22} />} tone="secondary" testId="dashboard-metric-active-patrols" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <DashboardMetricCard label="Today ANPR detections" value={metrics.todayAnprDetections} icon={<IconCar size={22} />} tone="secondary" testId="dashboard-metric-anpr-today" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <DashboardMetricCard
            label="Flagged detections"
            value={metrics.flaggedAnprDetections}
            icon={<IconAlertTriangle size={22} />}
            tone="error"
            highlight={metrics.flaggedAnprDetections > 0}
            testId="dashboard-metric-anpr-flagged"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <DashboardMetricCard
            label="Auth alerts (24h)"
            value={metrics.authAlerts?.failedAttempts24h ?? 0}
            icon={<IconShieldLock size={22} />}
            tone="warning"
            hint={`${metrics.authAlerts?.suspiciousEvents24h ?? 0} suspicious`}
            highlight={(metrics.authAlerts?.failedAttempts24h ?? 0) > 0}
            testId="dashboard-metric-auth-alerts"
          />
        </Grid>
      </Grid>

      <Grid container spacing={gridSpacing}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <DashboardSectionCard title="Active patrol" subtitle="Live guard positions" icon={<IconMap2 size={20} />} tone="secondary" testId="dashboard-section-active-patrol">
            <ActivePatrolPanel activeCount={metrics.activePatrols} locations={sections.activePatrolLocations} timezone={timezone} />
          </DashboardSectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <DashboardSectionCard title="Camera health" icon={<IconCamera size={20} />} tone="success" testId="dashboard-section-camera-health">
            <DashboardCameraHealth health={sections.cameraHealth} />
          </DashboardSectionCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard
            title="Recent ANPR detections"
            icon={<IconCar size={20} />}
            tone="secondary"
            action={{ label: 'ANPR Monitoring', path: '/admin/anpr-monitoring', testId: 'dashboard-link-anpr' }}
            testId="dashboard-section-anpr"
          >
            <DashboardRecentAnprList events={sections.recentAnprEvents} timezone={timezone} />
          </DashboardSectionCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard
            title="Blockchain proof health"
            icon={<IconLink size={20} />}
            tone="secondary"
            action={{ label: 'Blockchain Monitoring', path: '/admin/blockchain-monitoring', testId: 'dashboard-link-blockchain' }}
            testId="dashboard-section-blockchain"
          >
            <DashboardBlockchainHealth blockchain={metrics.blockchain} />
          </DashboardSectionCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard
            title="Patrols needing review"
            icon={<IconAlertTriangle size={20} />}
            tone="warning"
            action={{ label: 'Patrol Monitoring', path: '/admin/patrol-monitoring', testId: 'dashboard-link-patrol' }}
            testId="dashboard-section-review-patrols"
          >
            <DashboardPatrolList
              sessions={sections.patrolSessionsNeedingReview}
              timezone={timezone}
              detailBasePath="/admin/patrol-monitoring"
              emptyTitle="No patrols need review"
              emptyMessage="Sessions with incomplete or attention-worthy checkpoints appear here."
            />
          </DashboardSectionCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard
            title="Recent auth alerts"
            icon={<IconShieldLock size={20} />}
            tone="error"
            action={{ label: 'Auth Monitoring', path: '/admin/auth-monitoring', testId: 'dashboard-link-auth' }}
            testId="dashboard-section-auth-alerts"
          >
            <DashboardAuthAlerts alerts={sections.authAlerts?.recent} timezone={timezone} />
          </DashboardSectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}

function OperatorDashboard({ summary, timezone }) {
  const metrics = summary?.summary ?? {};
  const sections = summary?.sections ?? {};

  return (
    <Stack spacing={gridSpacing} data-testid="dashboard-operator-layout">
      <Grid container spacing={gridSpacing}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <DashboardMetricCard label="Active patrols" value={metrics.activePatrols} icon={<IconRoute size={22} />} tone="secondary" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <DashboardMetricCard label="Today ANPR detections" value={metrics.todayAnprDetections} icon={<IconCar size={22} />} tone="secondary" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <DashboardMetricCard
            label="Flagged ANPR detections"
            value={metrics.flaggedAnprDetections} 
            icon={<IconAlertTriangle size={22} />}
            tone="error"
            highlight={metrics.flaggedAnprDetections > 0}
          />
        </Grid>
      </Grid>

      <Grid container spacing={gridSpacing}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <DashboardSectionCard
            title="Active patrol"
            subtitle="Live guard positions"
            icon={<IconMap2 size={20} />}
            tone="secondary"
            action={{ label: 'Patrol Monitoring', path: '/admin/patrol-monitoring', testId: 'dashboard-link-patrol' }}
            testId="dashboard-section-active-patrol"
          >
            <ActivePatrolPanel activeCount={metrics.activePatrols} locations={sections.activePatrolLocations} timezone={timezone} />
          </DashboardSectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <DashboardSectionCard
            title="Recent ANPR detections"
            icon={<IconCar size={20} />}
            tone="secondary"
            action={{ label: 'ANPR Monitoring', path: '/admin/anpr-monitoring', testId: 'dashboard-link-anpr' }}
            testId="dashboard-section-anpr"
          >
            <DashboardRecentAnprList events={sections.recentAnprEvents} timezone={timezone} />
          </DashboardSectionCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard
            title="Patrols needing review"
            icon={<IconAlertTriangle size={20} />}
            tone="warning"
            action={{ label: 'Patrol Monitoring', path: '/admin/patrol-monitoring', testId: 'dashboard-link-review' }}
            testId="dashboard-section-review-patrols"
          >
            <DashboardPatrolList
              sessions={sections.patrolSessionsNeedingReview}
              timezone={timezone}
              detailBasePath="/admin/patrol-monitoring"
              emptyTitle="No patrols need review"
              emptyMessage="Sessions with incomplete or attention-worthy checkpoints appear here."
            />
          </DashboardSectionCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard title="Camera health summary" icon={<IconCamera size={20} />} tone="success" testId="dashboard-section-camera-health">
            <DashboardCameraHealth health={sections.cameraHealth} />
          </DashboardSectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}

function GuardDashboard({ summary, timezone }) {
  const metrics = summary?.summary ?? {};
  const sections = summary?.sections ?? {};

  return (
    <Stack spacing={gridSpacing} data-testid="dashboard-guard-layout">
      <Grid container spacing={gridSpacing}>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard title="Today patrol & active patrol" icon={<IconActivity size={20} />} tone="secondary" testId="dashboard-section-guard-patrol">
            <DashboardGuardPatrolPanel
              hasActivePatrol={Boolean(metrics.hasActivePatrol)}
              todayStatus={metrics.todayPatrolStatus}
              todayCount={metrics.todayPatrolCount ?? 0}
              readinessMessage={metrics.readiness?.message}
            />
          </DashboardSectionCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DashboardSectionCard title="PWA status" subtitle="Readiness & offline sync" icon={<IconDeviceMobile size={20} />} tone="success" testId="dashboard-section-pwa">
            <DashboardPwaReadiness readinessMessage={metrics.readiness?.message} />
          </DashboardSectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={gridSpacing}>
        <Grid size={{ xs: 12, md: 5 }}>
          <DashboardSectionCard title="Active patrol" icon={<IconRoute size={20} />} tone="secondary" testId="dashboard-section-active-patrol">
            {sections.activePatrol ? (
              <DashboardPatrolList sessions={[sections.activePatrol]} timezone={timezone} />
            ) : (
              <ContentEmptyState
                title="No active patrol"
                message="Start a patrol when you are ready to begin your route."
                testId="dashboard-guard-no-active"
              />
            )}
          </DashboardSectionCard>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <DashboardSectionCard title="Recent patrol sessions" icon={<IconClipboardList size={20} />} testId="dashboard-section-recent-patrols">
            <DashboardPatrolList
              sessions={sections.recentPatrolSessions}
              timezone={timezone}
              emptyTitle="No patrol history yet"
              emptyMessage="Your recent patrol sessions will appear here."
            />
          </DashboardSectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}

function RoleDashboard({ summary, timezone, role }) {
  if (role === ROLES.ADMIN) {
    return <AdminDashboard summary={summary} timezone={timezone} />;
  }
  if (role === ROLES.SECURITY_OPERATOR) {
    return <OperatorDashboard summary={summary} timezone={timezone} />;
  }
  if (role === ROLES.GUARD) {
    return <GuardDashboard summary={summary} timezone={timezone} />;
  }

  return (
    <ContentEmptyState
      title="Dashboard unavailable"
      message="Your role does not have a configured dashboard layout."
      testId="dashboard-unknown-role"
    />
  );
}

export default function DashboardHome() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new DashboardRepository(dashboardService);
  }

  const controller = useDashboardController(repositoryRef.current);
  const timezone = controller.summary?.timezone ?? 'Asia/Kuala_Lumpur';

  if (controller.isInitialLoad) {
    return (
      <MainCard title="Dashboard" contentSX={{ p: { xs: 2, sm: 3 } }}>
        <DashboardMetricsSkeleton count={8} />
      </MainCard>
    );
  }

  if (controller.error && !controller.summary) {
    return (
      <MainCard title="Dashboard">
        <ContentErrorState message={controller.error} onRetry={controller.handleRetry} testId="dashboard-error-state" />
      </MainCard>
    );
  }

  const isEmptySummary =
    controller.summary &&
    !controller.summary.sections?.recentAnprEvents?.length &&
    !controller.summary.sections?.activePatrolSessions?.length &&
    !controller.summary.sections?.activePatrol &&
    (controller.summary.summary?.totalUsers ?? 0) <= 1 &&
    (controller.summary.summary?.activePatrols ?? 0) === 0 &&
    (controller.summary.summary?.todayAnprDetections ?? 0) === 0 &&
    (controller.summary.summary?.blockchain?.failed ?? 0) === 0 &&
    (controller.summary.summary?.authAlerts?.failedAttempts24h ?? 0) === 0 &&
    controller.role !== ROLES.GUARD;

  return (
    <Stack spacing={gridSpacing}>
      {controller.refreshing ? <LinearProgress color="secondary" data-testid="dashboard-refresh-progress" sx={{ borderRadius: 1 }} /> : null}

      <DashboardRoleHeader
        role={controller.role}
        lastUpdatedAt={controller.lastUpdatedAt}
        timezone={timezone}
        onRefresh={controller.handleRefresh}
        refreshing={controller.refreshing}
      />

      {controller.error ? (
        <ContentErrorState message={controller.error} onRetry={controller.handleRetry} testId="dashboard-inline-error" />
      ) : null}

      {isEmptySummary ? (
        <Box>
          <Chip size="small" color="secondary" variant="outlined" label="Awaiting operational data" sx={{ mb: 1 }} />
          <ContentEmptyState
            title="No operational activity yet"
            message="Metrics and lists will populate as patrols, ANPR events, and system health data arrive."
            testId="dashboard-empty-state"
          />
        </Box>
      ) : null}

      {controller.summary ? <RoleDashboard summary={controller.summary} timezone={timezone} role={controller.role} /> : null}
    </Stack>
  );
}
