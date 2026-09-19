import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AuthAuditLogTable from './AuthAuditLogTable';
import AuthSessionTable from './AuthSessionTable';

describe('AuthAuditLogTable', () => {
  it('renders audit rows without sensitive token fields', () => {
    render(
      <AuthAuditLogTable
        logs={[
          {
            id: '1',
            action: 'refresh_success',
            status: 'success',
            email: 'guard@example.com',
            ip_address: '127.0.0.1',
            user_agent: 'PHPUnit',
            metadata: { session_id: 'session-1' },
            occurred_at: '2026-07-02T10:00:00+00:00'
          }
        ]}
      />
    );

    expect(screen.getByText('refresh_success')).toBeInTheDocument();
    expect(screen.queryByText(/token_hash/i)).toBeNull();
    expect(screen.queryByText(/refresh_token/i)).toBeNull();
  });
});

describe('AuthSessionTable', () => {
  const sessions = [
    {
      id: 'session-1',
      user: { email: 'guard@example.com' },
      ip_address: '127.0.0.1',
      user_agent: 'Mozilla/5.0',
      created_at: '2026-07-02T10:00:00+00:00',
      last_used_at: '2026-07-02T10:05:00+00:00',
      expires_at: '2026-07-02T22:00:00+00:00',
      is_active: true,
      is_current: true,
      token_hash: 'should-not-render'
    }
  ];

  it('does not display token-like fields', () => {
    const { container } = render(<AuthSessionTable sessions={sessions} onRevoke={vi.fn()} showUserColumn={false} />);

    expect(container.textContent).not.toMatch(/token_hash/i);
    expect(container.textContent).not.toMatch(/refresh_token/i);
    expect(screen.queryByText('User')).toBeNull();
  });

  it('marks the current session in the status chip', () => {
    render(<AuthSessionTable sessions={sessions} onRevoke={vi.fn()} showUserColumn={false} />);

    expect(screen.getByText(/current/i)).toBeInTheDocument();
  });

  it('calls revoke handler when revoke is clicked', async () => {
    const onRevoke = vi.fn();
    const user = userEvent.setup();

    render(<AuthSessionTable sessions={sessions} onRevoke={onRevoke} showUserColumn={false} />);

    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(onRevoke).toHaveBeenCalledWith('session-1');
  });
});
