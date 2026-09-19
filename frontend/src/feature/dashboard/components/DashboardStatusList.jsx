import PropTypes from 'prop-types';
import { Chip, Stack, Typography } from '@mui/material';

import ContentEmptyState from 'ui-component/state/ContentEmptyState';

export default function DashboardStatusList({ items, emptyTitle = 'No items', emptyMessage = 'Nothing to show yet.' }) {
  if (!items?.length) {
    return <ContentEmptyState title={emptyTitle} message={emptyMessage} testId="dashboard-status-list-empty" />;
  }

  return (
    <Stack spacing={1.5} data-testid="dashboard-status-list">
      {items.map((item) => (
        <Stack
          key={item.id ?? item.label}
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography variant="body2">{item.label}</Typography>
          <Chip size="small" label={item.value} color={item.color ?? 'default'} />
        </Stack>
      ))}
    </Stack>
  );
}

DashboardStatusList.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      label: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      color: PropTypes.string
    })
  ),
  emptyTitle: PropTypes.string,
  emptyMessage: PropTypes.string
};
