import { Activity, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

// material-ui
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project imports
import MainCard from 'ui-component/cards/MainCard';
import Transitions from 'ui-component/extended/Transitions';

// assets
import { IconBell } from '@tabler/icons-react';

// ==============================|| NOTIFICATION ||============================== //

export default function NotificationSection() {
  const theme = useTheme();
  const downMD = useMediaQuery(theme.breakpoints.down('md'));

  const [open, setOpen] = useState(false);

  /**
   * anchorRef is used on different componets and specifying one type leads to other components throwing an error
   * */
  const anchorRef = useRef(null);

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event) => {
    if (anchorRef.current && anchorRef.current.contains(event.target)) {
      return;
    }
    setOpen(false);
  };

  const prevOpen = useRef(open);
  useEffect(() => {
    if (prevOpen.current === true && open === false) {
      anchorRef.current.focus();
    }
    prevOpen.current = open;
  }, [open]);

  return (
    <>
      <Box sx={{ ml: 2 }}>
        <Avatar
          variant="rounded"
          sx={{
            ...theme.typography.commonAvatar,
            ...theme.typography.mediumAvatar,
            transition: 'all .2s ease-in-out',
            color: theme.vars.palette.warning.dark,
            background: theme.vars.palette.warning.light,
            '&:hover, &[aria-controls="menu-list-grow"]': {
              color: theme.vars.palette.warning.light,
              background: theme.vars.palette.warning.dark
            }
          }}
          ref={anchorRef}
          aria-controls={open ? 'menu-list-grow' : undefined}
          aria-haspopup="true"
          onClick={handleToggle}
        >
          <IconBell stroke={1.5} size="20px" />
        </Avatar>
      </Box>
      {/* <Popper
        placement={downMD ? 'bottom' : 'bottom-end'}
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        modifiers={[{ name: 'offset', options: { offset: [downMD ? 5 : 0, 20] } }]}
      >
        {({ TransitionProps }) => (
          <ClickAwayListener onClickAway={handleClose}>
            <Transitions position={downMD ? 'top' : 'top-right'} in={open} {...TransitionProps}>
              <Paper>
                <Activity mode={open ? 'visible' : 'hidden'}>
                  <MainCard border={false} elevation={16} content={false} boxShadow shadow={theme.shadows[16]} sx={{ maxWidth: 330 }}>
                    <Stack sx={{ gap: 2, p: 2 }}>
                      <Typography variant="subtitle1">Notifications</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Push notification preferences are managed in Account Settings. Enable browser notifications there to receive patrol
                        and system alerts.
                      </Typography>
                      <Button
                        component={RouterLink}
                        to="/account/profile?tab=profile"
                        variant="contained"
                        size="small"
                        onClick={handleClose}
                      >
                        Open notification settings
                      </Button>
                    </Stack>
                  </MainCard>
                </Activity>
              </Paper>
            </Transitions>
          </ClickAwayListener>
        )}
      </Popper> */}
    </>
  );
}
