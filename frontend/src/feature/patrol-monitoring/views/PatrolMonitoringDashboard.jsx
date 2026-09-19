import { useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';
import { IconRefresh } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import LiveIndicator from 'ui-component/LiveIndicator';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';
import ContentEmptyState from 'ui-component/state/ContentEmptyState';
import ContentErrorState from 'ui-component/state/ContentErrorState';

import patrolMonitoringService from '../datasources/patrolMonitoringService';
import { PatrolMonitoringRepository } from '../repositories/patrolMonitoringRepository';
import { usePatrolMonitoringController } from '../controllers/usePatrolMonitoringController';
import PatrolSessionTable from '../components/PatrolSessionTable';
import PatrolRealtimeSnackbar from '../components/PatrolRealtimeSnackbar';

function StatCard({ label, value, highlight = false }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderColor: highlight ? 'warning.main' : 'divider',
        bgcolor: highlight ? 'action.hover' : 'background.paper'
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700}>
        {value}
      </Typography>
    </Paper>
  );
}

function PatrolMonitoringTitle({ liveStatus }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
      <Typography component="span" variant="h3">
        Patrol Monitoring
      </Typography>
      <LiveIndicator status={liveStatus} />
    </Box>
  );
}

function emptyStateMessage({ filterText, statusFilter, zoneFilter, attentionFilter }) {
  if (filterText || statusFilter || zoneFilter || attentionFilter) {
    return 'No patrol sessions match the current filters. Try adjusting search or filter criteria.';
  }
  return 'No patrol sessions have been recorded yet.';
}

export default function PatrolMonitoringDashboard() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new PatrolMonitoringRepository(patrolMonitoringService);
  }
  const controller = usePatrolMonitoringController(repositoryRef.current);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const showEmpty = !controller.loading && controller.sessions.length === 0 && !controller.error;
  const showInitialTableSkeleton = controller.loading && controller.sessions.length === 0 && !controller.error;

  return (
    <MainCard
      title={<PatrolMonitoringTitle liveStatus={controller.liveStatus} />}
      secondary={
        <Button variant="outlined" startIcon={<IconRefresh size={18} />} onClick={controller.handleRefresh} disabled={controller.loading}>
          Refresh
        </Button>
      }
    >
      <PatrolRealtimeSnackbar />
      <Stack spacing={2}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <StatCard label="Total sessions" value={controller.stats.total} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <StatCard label="Active" value={controller.stats.active} highlight={controller.stats.active > 0} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <StatCard label="Completed" value={controller.stats.completed} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <StatCard label="Needs review" value={controller.stats.needsReviewEvents} highlight={controller.stats.needsReviewEvents > 0} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <StatCard label="Suspicious" value={controller.stats.suspiciousEvents} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}>
            <StatCard label="Partial / missed" value={`${controller.stats.partialEvents} / ${controller.stats.missedEvents}`} />
          </Grid>
        </Grid>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            label="Search guard or zone"
            value={controller.filterText}
            onChange={(e) => controller.handleFilterTextChange(e.target.value)}
            sx={{ minWidth: { sm: 220 }, flex: 1 }}
            data-testid="patrol-monitoring-search"
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={controller.statusFilter}
              onChange={(e) => controller.handleStatusFilterChange(e.target.value)}
              data-testid="patrol-monitoring-status-filter"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="aborted">Aborted</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Zone</InputLabel>
            <Select label="Zone" value={controller.zoneFilter} onChange={(e) => controller.handleZoneFilterChange(e.target.value)}>
              <MenuItem value="">All zones</MenuItem>
              {controller.zones.map((zone) => (
                <MenuItem key={zone.id} value={zone.id}>
                  {zone.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Attention</InputLabel>
            <Select
              label="Attention"
              value={controller.attentionFilter}
              onChange={(e) => controller.handleAttentionFilterChange(e.target.value)}
              data-testid="patrol-monitoring-attention-filter"
            >
              <MenuItem value="">All sessions</MenuItem>
              <MenuItem value="active">Active only</MenuItem>
              <MenuItem value="needs_review">Needs review</MenuItem>
              <MenuItem value="suspicious">Suspicious checkpoints</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {controller.error ? (
          <ContentErrorState message={controller.error} onRetry={controller.handleRetry} testId="patrol-monitoring-error" />
        ) : null}

        {controller.isRefreshing ? <LinearProgress /> : null}

        {showEmpty ? (
          <ContentEmptyState
            title="No patrol sessions"
            message={emptyStateMessage({
              filterText: controller.filterText,
              statusFilter: controller.statusFilter,
              zoneFilter: controller.zoneFilter,
              attentionFilter: controller.attentionFilter
            })}
            testId="patrol-monitoring-empty"
          />
        ) : (
          <Box sx={{ position: 'relative', opacity: controller.isRefreshing ? 0.85 : 1 }}>
            <PatrolSessionTable
              sessions={controller.sessions}
              summariesBySessionId={controller.summariesBySessionId}
              page={controller.page}
              rowsPerPage={controller.rowsPerPage}
              loading={showInitialTableSkeleton}
              onViewDetails={controller.handleViewDetails}
            />
          </Box>
        )}

        {!showEmpty ? (
          <PaginationFooter
            page={controller.page}
            rowsPerPage={controller.rowsPerPage}
            filteredCount={controller.totalCount}
            onPageChange={controller.handleChangePage}
            onRowsPerPageChange={controller.handleChangeRowsPerPage}
            isMobile={isMobile}
          />
        ) : null}
      </Stack>
    </MainCard>
  );
}
