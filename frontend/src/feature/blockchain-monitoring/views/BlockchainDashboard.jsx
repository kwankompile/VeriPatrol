import { useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography
} from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';
import { IconRefresh } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';

import blockchainMonitoringService from '../datasources/blockchainMonitoringService';
import { BlockchainMonitoringRepository } from '../repositories/BlockchainMonitoringRepository';
import { useBlockchainMonitoringController } from '../controllers/useBlockchainMonitoringController';
import BlockchainMetricCards from '../components/BlockchainMetricCards';
import BlockchainRecordFilters from '../components/BlockchainRecordFilters';
import BlockchainRecordTable from '../components/BlockchainRecordTable';
import BlockchainVerifyAllResults from '../components/BlockchainVerifyAllResults';

function EmptyState() {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 4,
        textAlign: 'center'
      }}
    >
      <Typography variant="h6" sx={{ mb: 1 }}>
        No blockchain records found
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Records will appear here after Laravel creates blockchain proof entries for anchored entities.
      </Typography>
    </Box>
  );
}

export default function BlockchainDashboard() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new BlockchainMonitoringRepository(blockchainMonitoringService);
  }
  const controller = useBlockchainMonitoringController(repositoryRef.current);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (controller.loading && controller.records.length === 0) {
    return (
      <MainCard title="Blockchain Monitoring">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      </MainCard>
    );
  }

  const failedCount = controller.summary?.failed ?? 0;
  const queuedCount = controller.summary?.queued ?? 0;

  return (
    <MainCard
      title="Blockchain Monitoring"
      secondary={
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            onClick={() => void controller.handleVerifyAll()}
            disabled={controller.verifyingAll || controller.loading}
          >
            {controller.verifyingAll ? 'Verifying…' : 'Verify all'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<IconRefresh size={18} />}
            onClick={controller.handleRefresh}
            disabled={controller.refreshing}
          >
            {controller.refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2}>
        {controller.error ? <Alert severity="error">{controller.error}</Alert> : null}

        {controller.verifyAllSummary ? (
          <BlockchainVerifyAllResults summary={controller.verifyAllSummary} onViewDetails={controller.handleViewDetails} />
        ) : null}

        {queuedCount > 0 ? (
          <Alert severity="info">
            {queuedCount} record{queuedCount === 1 ? '' : 's'} are queued for anchoring. Ensure the Laravel queue worker is running
            (`php artisan queue:work`).
          </Alert>
        ) : null}

        {failedCount > 0 ? (
          <Alert severity="warning">
            {failedCount} blockchain record{failedCount === 1 ? '' : 's'} failed anchoring or confirmation. Review failed
            records and retry when appropriate.
          </Alert>
        ) : null}

        <BlockchainMetricCards summary={controller.summary} />

        <BlockchainRecordFilters
          filters={controller.filters}
          onSearchChange={controller.handleSearchChange}
          onStatusChange={controller.handleStatusFilterChange}
          onNetworkChange={controller.handleNetworkFilterChange}
          onEnvironmentChange={controller.handleEnvironmentFilterChange}
          onEntityTypeChange={controller.handleEntityTypeFilterChange}
        />

        {controller.records.length === 0 ? (
          <EmptyState />
        ) : (
          <BlockchainRecordTable
            records={controller.records}
            page={controller.page}
            rowsPerPage={controller.rowsPerPage}
            onViewDetails={controller.handleViewDetails}
          />
        )}

        {controller.pagination.total > 0 ? (
          <PaginationFooter
            page={controller.page}
            rowsPerPage={controller.rowsPerPage}
            filteredCount={controller.pagination.total}
            onPageChange={controller.handleChangePage}
            onRowsPerPageChange={controller.handleChangeRowsPerPage}
            isMobile={isMobile}
          />
        ) : null}
      </Stack>
    </MainCard>
  );
}
