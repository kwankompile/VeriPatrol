import { useRef, useState } from 'react';
import { Alert, Stack, Tab, Tabs } from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';

import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';

import authMonitoringService from '../datasources/authMonitoringService';
import { AuthMonitoringRepository } from '../repositories/AuthMonitoringRepository';
import { useAuthAuditLogController } from '../controllers/useAuthAuditLogController';
import { useAuthSessionController } from '../controllers/useAuthSessionController';
import AuthAuditFilterBar from '../components/AuthAuditFilterBar';
import AuthAuditLogTable from '../components/AuthAuditLogTable';
import AuthSessionTable from '../components/AuthSessionTable';

export default function AuthMonitoringDashboard() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new AuthMonitoringRepository(authMonitoringService);
  }

  const auditController = useAuthAuditLogController(repositoryRef.current);
  const sessionController = useAuthSessionController(repositoryRef.current);
  const [tab, setTab] = useState(0);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const activeController = tab === 0 ? auditController : sessionController;

  return (
    <MainCard title="Auth Monitoring">
      <Stack spacing={2}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Audit Logs" />
          <Tab label="Sessions" />
        </Tabs>

        {tab === 0 && (
          <AuthAuditFilterBar filters={auditController.filters} onChange={auditController.updateFilters} />
        )}

        {activeController.error && <Alert severity="error">{activeController.error}</Alert>}

        {tab === 0 ? (
          <AuthAuditLogTable
            logs={auditController.logs}
            loading={auditController.loading}
            rowsPerPage={auditController.rowsPerPage}
          />
        ) : (
          <AuthSessionTable
            sessions={sessionController.sessions}
            revokingId={sessionController.revokingId}
            onRevoke={sessionController.revokeSession}
            loading={sessionController.loading}
            rowsPerPage={sessionController.rowsPerPage}
          />
        )}

        <PaginationFooter
          filteredCount={activeController.pagination.total}
          page={activeController.page}
          rowsPerPage={activeController.rowsPerPage}
          isMobile={isMobile}
          onPageChange={(_, nextPage) => activeController.setPage(nextPage)}
          onRowsPerPageChange={(event) => {
            activeController.setRowsPerPage(parseInt(event.target.value, 10));
            activeController.setPage(0);
          }}
        />
      </Stack>
    </MainCard>
  );
}
