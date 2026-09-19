import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';

const theme = createTheme();

export function renderWithProviders(ui, { route = '/' } = {}) {
  window.history.pushState({}, 'Test', route);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </MemoryRouter>
  );
}
