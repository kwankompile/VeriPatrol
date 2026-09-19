import React from 'react';
import { Box, Divider, Paper, Typography, List, ListItem, ListItemText, styled } from '@mui/material';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';

const Title = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  letterSpacing: 1.2,
  fontSize: '0.85rem',
  background: `linear-gradient(135deg, ${theme.palette.secondary.main} 100%, ${theme.palette.secondary.light} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  marginBottom: 20
}));

export function CheckpointHistoryData({ info }) {
  return (
    <>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Title>Checkpoint Histroy Details</Title>

        <List>
          {info.map((log, index) => (
            <React.Fragment key={log.id}>
              <ListItem
                sx={{
                  py: 1.5
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body1" sx={{ minWidth: 25, fontWeight: 'bold' }}>
                        {index + 1}.
                      </Typography>
                      <Typography variant="body1" sx={{ flex: 1 }}>
                        {log.checkpoint?.name || 'Unknown Checkpoint'}:
                        <Typography
                          component="span"
                          sx={{
                            ml: 1,
                            color: 'text.secondary',
                            fontWeight: 'medium'
                          }}
                        >
                          {<MalaysiaTime time={log.actual_time} />}
                        </Typography>
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
              {index < info.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </List>
      </Paper>
    </>
  );
}
