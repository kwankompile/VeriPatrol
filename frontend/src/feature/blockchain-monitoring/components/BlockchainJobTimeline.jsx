import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Stack,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Typography
} from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';

import BlockchainStatusChip from './BlockchainStatusChip';

export default function BlockchainJobTimeline({ jobs = [] }) {
  if (!jobs.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No blockchain jobs are recorded for this record yet.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Job timeline
      </Typography>
      <Stepper orientation="vertical" nonLinear>
        {jobs.map((job, index) => (
          <Step key={job.id ?? index} active expanded>
            <StepLabel
              optional={<BlockchainStatusChip kind="job" value={job.status} />}
            >
              <Typography variant="subtitle2">{job.jobType}</Typography>
            </StepLabel>
            <StepContent>
              <Paper variant="outlined" sx={{ p: 2, mb: 1 }}>
                <Stack spacing={0.75}>
                  <Typography variant="body2">
                    Attempts: {job.attempts} / {job.maxAttempts}
                  </Typography>
                  <Typography variant="body2">
                    Next attempt: <MalaysiaTime time={job.nextAttemptAt} />
                  </Typography>
                  <Typography variant="body2">
                    Started: <MalaysiaTime time={job.startedAt} />
                  </Typography>
                  <Typography variant="body2">
                    Finished: <MalaysiaTime time={job.finishedAt} />
                  </Typography>
                  {job.lastError ? (
                    <Typography variant="body2" color="error.main">
                      {job.lastError}
                    </Typography>
                  ) : null}
                </Stack>
              </Paper>
            </StepContent>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}

BlockchainJobTimeline.propTypes = {
  jobs: PropTypes.arrayOf(PropTypes.object)
};
