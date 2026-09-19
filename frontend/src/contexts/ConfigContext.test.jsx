import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ConfigProvider, useConfig } from 'contexts/ConfigContext';

vi.mock('hooks/useLocalStorage', () => ({
  useLocalStorage: vi.fn(() => ({
    state: { fontFamily: 'Inter', borderRadius: 8 },
    setState: vi.fn(),
    setField: vi.fn(),
    resetState: vi.fn()
  }))
}));

function ConfigConsumer() {
  const { state } = useConfig();
  return <div data-testid="config-font">{state.fontFamily}</div>;
}

describe('ConfigProvider', () => {
  it('renders children without throwing', () => {
    render(
      <ConfigProvider>
        <div data-testid="child">ok</div>
      </ConfigProvider>
    );

    expect(screen.getByTestId('child')).toHaveTextContent('ok');
  });

  it('provides useConfig to consumers under the provider', () => {
    render(
      <ConfigProvider>
        <ConfigConsumer />
      </ConfigProvider>
    );

    expect(screen.getByTestId('config-font')).toHaveTextContent('Inter');
  });
});
