import { describe, expect, it, vi } from 'vitest';

import {
  BlockchainMonitoringRepository,
  buildSepoliaExplorerUrl,
  formatStatusLabel,
  shortHash
} from '../repositories/BlockchainMonitoringRepository';

describe('BlockchainMonitoringRepository helpers', () => {
  it('shortens hashes safely', () => {
    expect(shortHash(null)).toBe('—');
    expect(shortHash('0xabc123def4567890abcdef1234567890abcdef1234567890abcdef1234567890')).toBe('0xabc123…567890');
  });

  it('builds Sepolia explorer URL only when network and tx hash are present', () => {
    expect(buildSepoliaExplorerUrl('ganache', '0xabc')).toBeNull();
    expect(buildSepoliaExplorerUrl('sepolia', '0xabc')).toBe('https://sepolia.etherscan.io/tx/0xabc');
    expect(buildSepoliaExplorerUrl('sepolia', '')).toBeNull();
  });

  it('formats backend job and verification status labels', () => {
    expect(formatStatusLabel('success', { success: 'Success' })).toBe('Success');
    expect(formatStatusLabel('cancelled', { cancelled: 'Cancelled' })).toBe('Cancelled');
    expect(formatStatusLabel('tampered', { tampered: 'Tampered' })).toBe('Tampered');
    expect(formatStatusLabel('onchain_missing', { onchain_missing: 'On-chain Missing' })).toBe('On-chain Missing');
    expect(formatStatusLabel('custom_state', {})).toBe('Custom State');
  });
});

describe('BlockchainMonitoringRepository', () => {
  it('builds list query params from filters', () => {
    const repo = new BlockchainMonitoringRepository({});
    const params = repo.buildListQueryParams(
      { status: 'failed', network: 'sepolia', entityType: 'anpr_event', search: ' 0xabc ' },
      1,
      25
    );
    expect(params).toEqual({
      page: 2,
      per_page: 25,
      sort_by: 'created_at',
      sort_order: 'desc',
      status: 'failed',
      network: 'sepolia',
      entity_type: 'anpr_event',
      search: '0xabc'
    });
  });

  it('maps user_profile entity type in list query params and normalization', () => {
    const repo = new BlockchainMonitoringRepository({});
    const params = repo.buildListQueryParams({ entityType: 'user_profile' }, 0, 20);

    expect(params.entity_type).toBe('user_profile');

    const record = repo.normalizeRecord({
      id: 'rec-profile-1',
      entity_type: 'user_profile',
      proof_type: 'profile_password_changed',
      status: 'confirmed',
      payload_summary: {
        module: 'profile',
        profile_version: 7,
        revoked_count: 1
      },
      jobs: [],
      verifications: []
    });

    expect(record.entityTypeLabel).toBe('User Profile');
    expect(record.payloadSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'profile_version', value: '7' })
      ])
    );
  });

  it('omits all-value filters', () => {
    const repo = new BlockchainMonitoringRepository({});
    const params = repo.buildListQueryParams({ status: 'all', network: 'all', entityType: 'all' }, 0, 10);
    expect(params).toEqual({
      page: 1,
      per_page: 10,
      sort_by: 'created_at',
      sort_order: 'desc'
    });
  });

  it('normalizes paginated Laravel envelopes', async () => {
    const dataSource = {
      getBlockchainRecords: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'rec-1',
            entity_type: 'anpr_event',
            proof_type: 'event_hash',
            status: 'confirmed',
            record_hash: '0xabc123def4567890abcdef1234567890abcdef1234567890abcdef1234567890',
            network: 'sepolia',
            environment: 'staging'
          }
        ],
        meta: {
          total: 1,
          current_page: 1,
          last_page: 1,
          per_page: 10
        }
      })
    };
    const repo = new BlockchainMonitoringRepository(dataSource);
    const result = await repo.getBlockchainRecords({});
    expect(result.records).toHaveLength(1);
    expect(result.records[0].entityTypeLabel).toBe('ANPR Event');
    expect(result.records[0].recordHashShort).toContain('…');
    expect(result.pagination.total).toBe(1);
  });

  it('normalizes summary counts', async () => {
    const dataSource = {
      getBlockchainSummary: vi.fn().mockResolvedValue({
        success: true,
        data: {
          total: 10,
          pending: 2,
          queued: 1,
          processing: 1,
          submitted: 2,
          confirmed: 3,
          failed: 1,
          network_counts: [{ network: 'ganache', count: 6 }],
          environment_counts: [{ environment: 'local', count: 6 }],
          latest_failed_records: []
        }
      })
    };
    const repo = new BlockchainMonitoringRepository(dataSource);
    const summary = await repo.getBlockchainSummary();
    expect(summary.inFlight).toBe(4);
    expect(summary.primaryNetwork).toBe('ganache');
  });

  it('maps patrol_session entity type label', () => {
    const repo = new BlockchainMonitoringRepository({});
    const record = repo.normalizeRecord({
      id: 'rec-patrol-1',
      entity_type: 'patrol_session',
      proof_type: 'validation_result',
      status: 'confirmed',
      payload_summary: {
        module: 'patrol',
        total_location_logs: 12,
        total_gaps: 1
      },
      jobs: [],
      verifications: []
    });

    expect(record.entityTypeLabel).toBe('Patrol Session');
    expect(record.payloadSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'total_location_logs', value: '12' })
      ])
    );
  });

  it('maps anpr_image entity type label', () => {
    const repo = new BlockchainMonitoringRepository({});
    const record = repo.normalizeRecord({
      id: 'rec-image-1',
      entity_type: 'anpr_image',
      proof_type: 'evidence_file',
      status: 'confirmed',
      payload_summary: {
        module: 'anpr',
        file_sha256: 'abc123',
        evidence_hash_source: 'file'
      },
      jobs: [],
      verifications: []
    });

    expect(record.entityTypeLabel).toBe('ANPR Image');
  });

  it('normalizes payload summary as safe key-value rows', () => {
    const repo = new BlockchainMonitoringRepository({});
    const record = repo.normalizeRecord({
      id: 'rec-2',
      entity_type: 'patrol_session',
      status: 'failed',
      payload_summary: {
        session_id: 'sess-1',
        rpc_url: 'http://secret',
        private_key: 'hidden'
      },
      jobs: [],
      verifications: []
    });
    expect(record.payloadSummary).toEqual([{ key: 'session_id', label: 'Session Id', value: 'sess-1' }]);
    expect(record.canRetry).toBe(true);
  });

  it('normalizes jobs and verifications on detail records', () => {
    const repo = new BlockchainMonitoringRepository({});
    const record = repo.normalizeRecord({
      id: 'rec-3',
      entity_type: 'anpr_event',
      status: 'submitted',
      network: 'sepolia',
      tx_hash: '0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface',
      jobs: [
        { id: 'job-1', job_type: 'anchor', status: 'success', attempts: 2, max_attempts: 3 },
        { id: 'job-2', job_type: 'verify', status: 'cancelled', attempts: 1, max_attempts: 1 }
      ],
      verifications: [
        {
          id: 'ver-1',
          result: 'valid',
          stored_hash: '0xabc',
          verified_by_user: { id: 'u1', name: 'Admin User' }
        },
        {
          id: 'ver-2',
          result: 'tampered',
          stored_hash: '0xdef'
        },
        {
          id: 'ver-3',
          result: 'onchain_missing',
          stored_hash: '0xghi'
        }
      ]
    });
    expect(record.jobs[0].statusLabel).toBe('Success');
    expect(record.jobs[1].statusLabel).toBe('Cancelled');
    expect(record.latestVerification.resultLabel).toBe('Valid');
    expect(record.verifications[1].resultLabel).toBe('Tampered');
    expect(record.verifications[2].resultLabel).toBe('On-chain Missing');
    expect(record.explorerUrl).toContain('sepolia.etherscan.io');
    expect(record.canRefreshConfirmation).toBe(true);
  });
});
