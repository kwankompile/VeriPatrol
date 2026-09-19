import PropTypes from 'prop-types';
import { Chip } from '@mui/material';

const NETWORK_COLORS = {
  ganache: 'default',
  sepolia: 'primary'
};

export default function BlockchainNetworkBadge({ network, environment }) {
  if (!network && !environment) {
    return <Chip label="—" size="small" variant="outlined" />;
  }

  const label = environment ? `${network || '—'} · ${environment}` : network || '—';

  return (
    <Chip
      label={label}
      size="small"
      color={NETWORK_COLORS[network] ?? 'default'}
      variant="outlined"
    />
  );
}

BlockchainNetworkBadge.propTypes = {
  network: PropTypes.string,
  environment: PropTypes.string
};
