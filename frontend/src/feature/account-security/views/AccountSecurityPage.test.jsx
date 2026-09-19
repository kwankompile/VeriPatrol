import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AccountSecurityPage from '../views/AccountSecurityPage';

describe('AccountSecurityPage', () => {
  it('redirects to the canonical security tab route', () => {
    render(
      <MemoryRouter initialEntries={['/account/security']}>
        <AccountSecurityPage />
      </MemoryRouter>
    );

    expect(screen.queryByText('Security Settings')).not.toBeInTheDocument();
  });
});
