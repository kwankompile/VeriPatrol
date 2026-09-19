import PropTypes from 'prop-types';
import { Box, Stack, Typography } from '@mui/material';

function SummaryRow({ label, value }) {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

SummaryRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired
};

export default function BlockchainPayloadSummary({ items = [] }) {
  if (!items.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No payload summary is available for this record.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 2
      }}
    >
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Payload summary
      </Typography>
      <Stack spacing={1}>
        {items.map((item) => (
          <SummaryRow key={item.key} label={item.label} value={item.value} />
        ))}
      </Stack>
    </Box>
  );
}

BlockchainPayloadSummary.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      value: PropTypes.string.isRequired
    })
  )
};
