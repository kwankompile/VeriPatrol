import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'test/testUtils';
import { CameraManagementRepository } from './repositories/CameraManagementRepository';
import CameraFormDrawer from './components/CameraFormDrawer';
import CameraDetailDrawer from './components/CameraDetailDrawer';
import { maskRtspUrl } from './utils/cameraValidation';

const sampleApiCamera = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Gate Camera 1',
  email: 'gate-cam-1@cameras.local',
  password: 'must-not-appear',
  credential_enabled: true,
  is_active: true,
  location: 'Main Gate',
  rtsp_url: 'rtsp://user:secret@192.168.1.10/stream',
  rtsp_url_masked: 'rtsp://***@192.168.1.10/stream',
  rtsp_reported_at: '2026-07-01T10:00:00Z',
  last_login_at: '2026-07-01T09:00:00Z',
  last_seen_at: '2026-07-01T10:05:00Z',
  credential_rotated_at: '2026-06-01T08:00:00Z',
  latitude: 3.14,
  longitude: 101.69,
  resolution_width: 1920,
  resolution_height: 1080,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-07-01T10:00:00Z'
};

describe('CameraManagementRepository', () => {
  it('normalizes camera payloads and masks RTSP display safely', () => {
    const repo = new CameraManagementRepository({});
    const normalized = repo.normalizeCamera(sampleApiCamera);

    expect(normalized.name).toBe('Gate Camera 1');
    expect(normalized.rtspUrlMasked).toBe('rtsp://***@192.168.1.10/stream');
    expect(normalized.password).toBeUndefined();
    expect(normalized.operationalStatusLabel).toBeTruthy();
    expect(normalized.formattedLastSeenAt).not.toBe('—');
  });

  it('handles unpaginated array envelopes', async () => {
    const dataSource = {
      getCameras: vi.fn().mockResolvedValue({
        success: true,
        data: [sampleApiCamera]
      })
    };
    const repo = new CameraManagementRepository(dataSource);
    const result = await repo.getCameras();

    expect(result.cameras).toHaveLength(1);
    expect(result.isServerPaginated).toBe(false);
    expect(result.pagination.total).toBe(1);
  });

  it('handles Laravel paginator envelopes', async () => {
    const dataSource = {
      getCameras: vi.fn().mockResolvedValue({
        success: true,
        data: {
          data: [sampleApiCamera],
          total: 1,
          current_page: 1,
          last_page: 1,
          per_page: 10
        }
      })
    };
    const repo = new CameraManagementRepository(dataSource);
    const result = await repo.getCameras({ page: 1, per_page: 10 });

    expect(result.cameras).toHaveLength(1);
    expect(result.isServerPaginated).toBe(true);
    expect(result.pagination.total).toBe(1);
  });

  it('buildCreatePayload includes only editable fields and password', () => {
    const repo = new CameraManagementRepository({});
    const payload = repo.buildCreatePayload({
      name: ' Gate ',
      email: ' cam@example.com ',
      password: 'SecureCameraPass1!',
      credentialEnabled: true,
      isActive: true,
      location: ' Entrance ',
      latitude: '3.1',
      longitude: '101.7',
      resolutionWidth: '1920',
      resolutionHeight: '1080',
      rtsp_url: 'must-not-send',
      last_seen_at: 'must-not-send'
    });

    expect(payload).toEqual({
      name: 'Gate',
      email: 'cam@example.com',
      password: 'SecureCameraPass1!',
      credential_enabled: true,
      is_active: true,
      location: 'Entrance',
      latitude: 3.1,
      longitude: 101.7,
      resolution_width: 1920,
      resolution_height: 1080
    });
    expect(payload.rtsp_url).toBeUndefined();
    expect(payload.last_seen_at).toBeUndefined();
  });

  it('buildUpdatePayload omits blank password', () => {
    const repo = new CameraManagementRepository({});
    const payload = repo.buildUpdatePayload({
      name: 'Gate Camera 1',
      email: 'gate-cam-1@cameras.local',
      password: '   ',
      credentialEnabled: false,
      isActive: true,
      location: null,
      latitude: '',
      longitude: '',
      resolutionWidth: '',
      resolutionHeight: ''
    });

    expect(payload.password).toBeUndefined();
    expect(payload.credential_enabled).toBe(false);
  });

  it('buildUpdatePayload excludes read-only backend fields', () => {
    const repo = new CameraManagementRepository({});
    const payload = repo.buildUpdatePayload({
      name: 'Gate Camera 1',
      email: 'gate-cam-1@cameras.local',
      password: 'NewPass123456!',
      credentialEnabled: true,
      isActive: true,
      location: 'Main Gate',
      latitude: null,
      longitude: null,
      resolutionWidth: null,
      resolutionHeight: null,
      rtsp_url: 'rtsp://hidden',
      last_seen_at: '2026-07-01T10:00:00Z',
      last_login_at: '2026-07-01T09:00:00Z'
    });

    expect(payload.password).toBe('NewPass123456!');
    expect(payload.rtsp_url).toBeUndefined();
    expect(payload.last_seen_at).toBeUndefined();
    expect(payload.last_login_at).toBeUndefined();
  });

  it('masks raw rtsp_url when rtsp_url_masked is absent', () => {
    const repo = new CameraManagementRepository({});
    const normalized = repo.normalizeCamera({
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Raw RTSP Camera',
      email: 'raw@cameras.local',
      rtsp_url: 'rtsp://user:secret@192.168.1.10/stream'
    });

    expect(normalized.rtspUrlMasked).toBe('rtsp://***@192.168.1.10/stream');
    expect(normalized.rtspUrlMasked).not.toContain('user');
    expect(normalized.rtspUrlMasked).not.toContain('secret');
  });

  it('shows not-reported fallback when camera has no RTSP fields', () => {
    const repo = new CameraManagementRepository({});
    const normalized = repo.normalizeCamera({
      id: '44444444-4444-4444-4444-444444444444',
      name: 'New Camera',
      email: 'new@cameras.local'
    });

    expect(normalized.rtspUrlMasked).toBe('—');
  });
});

describe('maskRtspUrl', () => {
  it('returns null for empty input so UI can show not-reported fallback', () => {
    expect(maskRtspUrl(null)).toBeNull();
    expect(maskRtspUrl(undefined)).toBeNull();
    expect(maskRtspUrl('')).toBeNull();
    expect(maskRtspUrl('   ')).toBeNull();
  });

  it('strips embedded credentials from raw RTSP URLs', () => {
    const masked = maskRtspUrl('rtsp://user:secret@192.168.1.10/stream');
    expect(masked).toBe('rtsp://***@192.168.1.10/stream');
    expect(masked).not.toContain('user');
    expect(masked).not.toContain('secret');
  });
});

describe('CameraFormDrawer', () => {
  it('renders password as optional on edit', () => {
    const camera = new CameraManagementRepository({}).normalizeCamera(sampleApiCamera);
    renderWithProviders(
      <CameraFormDrawer open mode="edit" camera={camera} saving={false} onClose={() => {}} onSave={() => {}} />
    );

    const passwordField = screen.getByLabelText(/password/i);
    expect(passwordField).not.toBeRequired();
    expect(screen.getByText(/leave blank to keep the current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/masked rtsp url/i)).toBeDisabled();
  });

  it('resets fields when switching edit from Camera A to Camera B', () => {
    const repo = new CameraManagementRepository({});
    const cameraA = repo.normalizeCamera({ ...sampleApiCamera, id: 'aaaa', name: 'Camera A', email: 'a@cameras.local', credential_enabled: false });
    const cameraB = repo.normalizeCamera({
      ...sampleApiCamera,
      id: 'bbbb',
      name: 'Camera B',
      email: 'b@cameras.local',
      credential_enabled: true,
      is_active: false
    });

    const { rerender } = renderWithProviders(
      <CameraFormDrawer open mode="edit" camera={cameraA} saving={false} onClose={() => {}} onSave={() => {}} />
    );

    expect(screen.getByLabelText(/camera name/i)).toHaveValue('Camera A');
    expect(screen.getByLabelText(/camera email/i)).toHaveValue('a@cameras.local');
    expect(screen.getByLabelText(/credential enabled/i)).not.toBeChecked();

    rerender(
      <CameraFormDrawer open mode="edit" camera={cameraB} saving={false} onClose={() => {}} onSave={() => {}} />
    );

    expect(screen.getByLabelText(/camera name/i)).toHaveValue('Camera B');
    expect(screen.getByLabelText(/camera email/i)).toHaveValue('b@cameras.local');
    expect(screen.getByLabelText(/credential enabled/i)).toBeChecked();
    expect(screen.getByLabelText(/^active$/i)).not.toBeChecked();
  });

  it('resets to empty fields when switching from edit to create', () => {
    const camera = new CameraManagementRepository({}).normalizeCamera(sampleApiCamera);
    const { rerender } = renderWithProviders(
      <CameraFormDrawer open mode="edit" camera={camera} saving={false} onClose={() => {}} onSave={() => {}} />
    );

    expect(screen.getByLabelText(/camera name/i)).toHaveValue('Gate Camera 1');

    rerender(<CameraFormDrawer open mode="create" camera={null} saving={false} onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByLabelText(/camera name/i)).toHaveValue('');
    expect(screen.getByLabelText(/camera email/i)).toHaveValue('');
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
    expect(screen.getByLabelText(/credential enabled/i)).toBeChecked();
    expect(screen.getByLabelText(/^active$/i)).toBeChecked();
  });
});

describe('CameraDetailDrawer', () => {
  it('shows read-only RTSP and operational timestamps', () => {
    const camera = new CameraManagementRepository({}).normalizeCamera(sampleApiCamera);
    renderWithProviders(
      <CameraDetailDrawer open camera={camera} onClose={() => {}} onEdit={() => {}} onDelete={() => {}} />
    );

    expect(screen.getByLabelText(/reported rtsp url \(masked\)/i)).toHaveValue('rtsp://***@192.168.1.10/stream');
    expect(screen.getByLabelText(/last login/i)).not.toHaveValue('—');
    expect(screen.getByLabelText(/last seen/i)).not.toHaveValue('—');
    expect(screen.getByText(/recent anpr event count: not available/i)).toBeInTheDocument();
  });

  it('masks raw rtsp_url in detail view when backend masking regresses', () => {
    const camera = new CameraManagementRepository({}).normalizeCamera({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Detail Camera',
      email: 'detail@cameras.local',
      rtsp_url: 'rtsp://user:secret@192.168.1.10/stream'
    });

    renderWithProviders(
      <CameraDetailDrawer open camera={camera} onClose={() => {}} onEdit={() => {}} onDelete={() => {}} />
    );

    const rtspField = screen.getByLabelText(/reported rtsp url \(masked\)/i);
    expect(rtspField).toHaveValue('rtsp://***@192.168.1.10/stream');
    expect(rtspField.value).not.toContain('secret');
    expect(rtspField.value).not.toContain('user');
  });
});

describe('CameraFormDrawer create submit', () => {
  it('submits editable fields including password on create', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(
      <CameraFormDrawer open mode="create" saving={false} onClose={() => {}} onSave={onSave} />
    );

    await user.type(screen.getByLabelText(/camera name/i), 'New Camera');
    await user.type(screen.getByLabelText(/camera email/i), 'new@cameras.local');
    await user.type(screen.getByLabelText(/password/i), 'SecureCameraPass1!');
    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Camera',
        email: 'new@cameras.local',
        password: 'SecureCameraPass1!'
      })
    );
  });
});
