import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { hasRole, ROLES } from 'utils/auth';

export const useBlockchainRecordDetailController = (repository) => {
  const { blockchainRecordId } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [refreshingConfirmation, setRefreshingConfirmation] = useState(false);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);

  const isAdmin = hasRole(ROLES.ADMIN);
  const canVerify = hasRole(ROLES.ADMIN) || hasRole(ROLES.SECURITY_OPERATOR);

  const loadRecord = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!blockchainRecordId) {
        setError('Blockchain record id is missing');
        setLoading(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const normalized = await repository.getBlockchainRecordById(blockchainRecordId);

        if (!normalized) {
          throw new Error('Blockchain record not found');
        }

        setRecord(normalized);
      } catch (err) {
        setRecord(null);
        setError(err.message || 'Failed to load blockchain record');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [repository, blockchainRecordId]
  );

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  const handleBack = () => {
    navigate('/admin/blockchain-monitoring');
  };

  const handleRefresh = () => {
    setActionMessage(null);
    void loadRecord({ isRefresh: true });
  };

  const handleVerify = async () => {
    if (!blockchainRecordId || !canVerify) return;

    try {
      setVerifying(true);
      setActionMessage(null);
      setError(null);

      await repository.verifyBlockchainRecord(blockchainRecordId);
      setActionMessage('Verification completed. Record detail has been refreshed.');
      await loadRecord({ isRefresh: true });
    } catch (err) {
      setActionMessage(null);
      setError(err.message || 'Failed to verify blockchain record');
    } finally {
      setVerifying(false);
    }
  };

  const handleRetry = async () => {
    if (!blockchainRecordId || !isAdmin) return;

    try {
      setRetrying(true);
      setActionMessage(null);
      setError(null);

      await repository.retryBlockchainRecord(blockchainRecordId);
      setActionMessage('Retry queued successfully. Record detail has been refreshed.');
      await loadRecord({ isRefresh: true });
    } catch (err) {
      setActionMessage(null);
      setError(err.message || 'Failed to retry blockchain record');
    } finally {
      setRetrying(false);
    }
  };

  const handleRefreshConfirmation = async () => {
    if (!blockchainRecordId || !record?.canRefreshConfirmation) return;

    try {
      setRefreshingConfirmation(true);
      setActionMessage(null);
      setError(null);

      const updated = await repository.refreshSubmittedBlockchainRecord(blockchainRecordId);
      setRecord(updated);
      setActionMessage('Confirmation refresh completed.');
    } catch (err) {
      setActionMessage(null);
      setError(err.message || 'Failed to refresh confirmation status');
    } finally {
      setRefreshingConfirmation(false);
    }
  };

  return {
    blockchainRecordId,
    record,
    loading,
    refreshing,
    verifying,
    retrying,
    refreshingConfirmation,
    error,
    actionMessage,
    isAdmin,
    canVerify,
    handleBack,
    handleRefresh,
    handleVerify,
    handleRetry,
    handleRefreshConfirmation
  };
};
