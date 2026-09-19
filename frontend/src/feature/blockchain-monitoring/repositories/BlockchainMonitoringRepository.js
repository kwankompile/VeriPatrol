import { unwrapPaginatedEnvelope } from '../datasources/blockchainMonitoringService';

const ENTITY_TYPE_LABELS = {
  anpr_event: 'ANPR Event',
  anpr_image: 'ANPR Image',
  patrol_session: 'Patrol Session',
  user_profile: 'User Profile'
};

const STATUS_LABELS = {
  pending: 'Pending',
  queued: 'Queued',
  processing: 'Processing',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  failed: 'Failed'
};

const JOB_STATUS_LABELS = {
  queued: 'Queued',
  processing: 'Processing',
  success: 'Success',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

const VERIFICATION_RESULT_LABELS = {
  valid: 'Valid',
  tampered: 'Tampered',
  pending: 'Pending',
  failed: 'Failed',
  onchain_missing: 'On-chain Missing'
};

export const formatStatusLabel = (value, labelMap) => {
  if (value === null || value === undefined || value === '') return 'Unknown';
  const key = String(value).toLowerCase();
  if (labelMap[key]) return labelMap[key];
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const shortHash = (value, prefixLength = 8, suffixLength = 6) => {
  if (!value || typeof value !== 'string') return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  if (trimmed.length <= prefixLength + suffixLength + 1) return trimmed;
  return `${trimmed.slice(0, prefixLength)}…${trimmed.slice(-suffixLength)}`;
};

export const buildSepoliaExplorerUrl = (network, txHash) => {
  if (network !== 'sepolia' || !txHash || typeof txHash !== 'string') return null;
  const trimmed = txHash.trim();
  if (!trimmed) return null;
  return `https://sepolia.etherscan.io/tx/${trimmed}`;
};

const normalizePayloadSummary = (summary) => {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return [];
  }

  return Object.entries(summary)
    .filter(([key]) => {
      const lower = String(key).toLowerCase();
      return !lower.includes('private') && !lower.includes('secret') && !lower.includes('rpc');
    })
    .map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value: value === null || value === undefined ? '—' : String(value)
    }));
};

const normalizeJob = (job) => {
  if (!job || typeof job !== 'object') return null;

  return {
    id: job.id ?? null,
    blockchainRecordId: job.blockchain_record_id ?? null,
    jobType: job.job_type ?? '—',
    status: job.status ?? 'unknown',
    statusLabel: formatStatusLabel(job.status, JOB_STATUS_LABELS),
    attempts: Number(job.attempts ?? 0),
    maxAttempts: Number(job.max_attempts ?? 0),
    displayAttempts:
      Number(job.max_attempts ?? 0) > 0
        ? Math.min(Number(job.attempts ?? 0), Number(job.max_attempts ?? 0))
        : Number(job.attempts ?? 0),
    nextAttemptAt: job.next_attempt_at ?? null,
    startedAt: job.started_at ?? null,
    finishedAt: job.finished_at ?? null,
    lastError: job.last_error ?? null,
    createdAt: job.created_at ?? null,
    updatedAt: job.updated_at ?? null
  };
};

const normalizeVerifiedByUser = (user) => {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id ?? null,
    name: user.name ?? 'Unknown user'
  };
};

const normalizeVerification = (verification) => {
  if (!verification || typeof verification !== 'object') return null;

  const result = verification.result ?? 'unknown';

  return {
    id: verification.id ?? null,
    blockchainRecordId: verification.blockchain_record_id ?? null,
    verifiedBy: verification.verified_by ?? null,
    verificationType: verification.verification_type ?? '—',
    storedHash: verification.stored_hash ?? null,
    storedHashShort: shortHash(verification.stored_hash),
    recomputedHash: verification.recomputed_hash ?? null,
    recomputedHashShort: shortHash(verification.recomputed_hash),
    onchainHash: verification.onchain_hash ?? null,
    onchainHashShort: shortHash(verification.onchain_hash),
    onchainFound: Boolean(verification.onchain_found),
    result,
    resultLabel: formatStatusLabel(result, VERIFICATION_RESULT_LABELS),
    errorMessage: verification.error_message ?? null,
    verifiedAt: verification.verified_at ?? null,
    createdAt: verification.created_at ?? null,
    verifiedByUser: normalizeVerifiedByUser(verification.verified_by_user)
  };
};

export class BlockchainMonitoringRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  assertSuccess(envelope, fallbackMessage) {
    if (envelope?.success === false) {
      throw new Error(envelope?.message || fallbackMessage);
    }
    return envelope;
  }

  buildListQueryParams(filters = {}, page = 0, rowsPerPage = 10) {
    const params = {
      page: page + 1,
      per_page: rowsPerPage,
      sort_by: 'created_at',
      sort_order: 'desc'
    };

    if (filters.status && filters.status !== 'all') {
      params.status = filters.status;
    }

    if (filters.network && filters.network !== 'all') {
      params.network = filters.network;
    }

    if (filters.environment && filters.environment !== 'all') {
      params.environment = filters.environment;
    }

    if (filters.entityType && filters.entityType !== 'all') {
      params.entity_type = filters.entityType;
    }

    const search = String(filters.search ?? '').trim();
    if (search) {
      params.search = search;
    }

    return params;
  }

  async getBlockchainRecords(params = {}) {
    const envelope = this.assertSuccess(
      await this.dataSource.getBlockchainRecords(params),
      'Failed to load blockchain records'
    );
    const { rows, meta } = unwrapPaginatedEnvelope(envelope);

    return {
      records: rows.map((record) => this.normalizeRecord(record)),
      pagination: {
        total: meta.total,
        page: meta.currentPage,
        perPage: meta.perPage,
        lastPage: meta.lastPage
      }
    };
  }

  async getBlockchainRecordById(id) {
    const envelope = this.assertSuccess(
      await this.dataSource.getBlockchainRecordById(id),
      'Failed to load blockchain record'
    );
    return this.normalizeRecord(envelope?.data ?? null);
  }

  async getBlockchainSummary() {
    const envelope = this.assertSuccess(
      await this.dataSource.getBlockchainSummary(),
      'Failed to load blockchain summary'
    );
    return this.normalizeSummary(envelope?.data ?? null);
  }

  async verifyBlockchainRecord(id) {
    const envelope = this.assertSuccess(
      await this.dataSource.verifyBlockchainRecord(id),
      'Failed to verify blockchain record'
    );
    return normalizeVerification(envelope?.data ?? null);
  }

  async retryBlockchainRecord(id) {
    const envelope = this.assertSuccess(
      await this.dataSource.retryBlockchainRecord(id),
      'Failed to retry blockchain record'
    );
    return this.normalizeRecord(envelope?.data ?? null);
  }

  async refreshSubmittedBlockchainRecord(id) {
    const envelope = this.assertSuccess(
      await this.dataSource.refreshSubmittedBlockchainRecord(id),
      'Failed to refresh blockchain record confirmation'
    );
    return this.normalizeRecord(envelope?.data ?? null);
  }

  async verifyAllBlockchainRecords(filters = {}) {
    const params = this.buildListQueryParams({ ...filters, search: filters.search ?? '' }, 0, 1);
    delete params.page;
    delete params.per_page;
    delete params.sort_by;
    delete params.sort_order;

    const envelope = await this.dataSource.verifyAllBlockchainRecords(params);

    if (envelope?.success === false) {
      const error = new Error(envelope?.message || 'Failed to verify blockchain records.');
      error.data = envelope?.data ?? null;
      throw error;
    }

    return envelope?.data ?? null;
  }

  normalizeSummary(summary) {
    if (!summary || typeof summary !== 'object') {
      return {
        total: 0,
        pending: 0,
        queued: 0,
        processing: 0,
        submitted: 0,
        confirmed: 0,
        failed: 0,
        inFlight: 0,
        networkCounts: [],
        environmentCounts: [],
        latestFailedRecords: [],
        primaryNetwork: null,
        primaryEnvironment: null,
        contractAddress: null,
        contractAddressShort: '—'
      };
    }

    const pending = Number(summary.pending ?? 0);
    const queued = Number(summary.queued ?? 0);
    const processing = Number(summary.processing ?? 0);

    const networkCounts = Array.isArray(summary.network_counts)
      ? summary.network_counts.map((row) => ({
          network: row.network ?? '—',
          count: Number(row.count ?? 0)
        }))
      : [];

    const environmentCounts = Array.isArray(summary.environment_counts)
      ? summary.environment_counts.map((row) => ({
          environment: row.environment ?? '—',
          count: Number(row.count ?? 0)
        }))
      : [];

    const latestFailedRecords = Array.isArray(summary.latest_failed_records)
      ? summary.latest_failed_records.map((record) => this.normalizeRecord(record))
      : [];

    return {
      total: Number(summary.total ?? 0),
      pending,
      queued,
      processing,
      submitted: Number(summary.submitted ?? 0),
      confirmed: Number(summary.confirmed ?? 0),
      failed: Number(summary.failed ?? 0),
      inFlight: pending + queued + processing,
      networkCounts,
      environmentCounts,
      latestFailedRecords,
      primaryNetwork: networkCounts[0]?.network ?? null,
      primaryEnvironment: environmentCounts[0]?.environment ?? null,
      contractAddress: null,
      contractAddressShort: '—'
    };
  }

  normalizeRecord(record) {
    if (!record || typeof record !== 'object') return null;

    const status = record.status ?? 'unknown';
    const network = record.network ?? null;
    const txHash = record.tx_hash ?? null;
    const entityType = record.entity_type ?? null;

    const jobs = (Array.isArray(record.jobs) ? record.jobs : [])
      .map((job) => normalizeJob(job))
      .filter(Boolean);

    const verifications = (Array.isArray(record.verifications) ? record.verifications : [])
      .map((verification) => normalizeVerification(verification))
      .filter(Boolean);

    const contractAddress = record.contract_address ?? null;

    return {
      id: record.id ?? null,
      entityType,
      entityTypeLabel: ENTITY_TYPE_LABELS[entityType] ?? entityType ?? '—',
      entityId: record.entity_id ?? null,
      proofType: record.proof_type ?? '—',
      canonicalVersion: record.canonical_version ?? null,
      hashAlgorithm: record.hash_algorithm ?? null,
      recordHash: record.record_hash ?? null,
      recordHashShort: shortHash(record.record_hash),
      payloadSummary: normalizePayloadSummary(record.payload_summary),
      network,
      environment: record.environment ?? null,
      chainId: record.chain_id ?? null,
      contractAddress,
      contractAddressShort: shortHash(contractAddress, 6, 4),
      txHash,
      txHashShort: shortHash(txHash),
      explorerUrl: buildSepoliaExplorerUrl(network, txHash),
      blockNumber: record.block_number ?? null,
      confirmations: record.confirmations ?? null,
      status,
      statusLabel: formatStatusLabel(status, STATUS_LABELS),
      retryCount: Number(record.retry_count ?? 0),
      lastError: record.last_error ?? null,
      submittedAt: record.submitted_at ?? null,
      confirmedAt: record.confirmed_at ?? null,
      createdAt: record.created_at ?? null,
      updatedAt: record.updated_at ?? null,
      jobs,
      verifications,
      latestVerification: verifications[0] ?? null,
      canRefreshConfirmation: status === 'submitted' && Boolean(txHash),
      canRetry: status === 'failed'
    };
  }
}
