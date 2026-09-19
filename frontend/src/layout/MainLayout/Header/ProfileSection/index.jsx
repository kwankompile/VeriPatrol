import { useEffect, useRef, useState } from 'react';
import { resolveProfilePictureUrl } from 'utils/getImageUrl';
import { useNavigate } from 'react-router-dom';

// material-ui
import { useTheme } from '@mui/material/styles';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
// import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
// import OutlinedInput from '@mui/material/OutlinedInput';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project imports
// import UpgradePlanCard from './UpgradePlanCard';
import MainCard from 'ui-component/cards/MainCard';
import Transitions from 'ui-component/extended/Transitions';
import useConfig from 'hooks/useConfig';
import { useAuthController } from 'feature/authentication/controllers/useAuthController';
import { getAuthUserRole } from 'utils/auth';

// assets
import User1 from 'assets/images/users/user-round.svg';
import { IconLogout, IconSettings, IconShieldLock } from '@tabler/icons-react';

// ==============================|| PROFILE MENU ||============================== //

export default function ProfileSection() {
  const theme = useTheme();
  const {
    state: { borderRadius }
  } = useConfig();

  const { currentUser, logoutLoading, logoutError, handleLogout } = useAuthController();
  const navigate = useNavigate();
  const roleName = getAuthUserRole();
  const displayName = currentUser?.name ?? 'User';
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const resolvedAvatarUrl = currentUser?.profile_picture_url
    ? resolveProfilePictureUrl(currentUser.profile_picture_url)
    : null;
  const avatarSrc = (!avatarLoadFailed && resolvedAvatarUrl) ? resolvedAvatarUrl : User1;

  // Reset the error flag whenever the resolved URL changes so a newly uploaded
  // picture is attempted again rather than immediately falling back to initials.
  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [resolvedAvatarUrl]);

  const [open, setOpen] = useState(false);

  /**
   * anchorRef is used on different components and specifying one type leads to other components throwing an error
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
      <Chip
        slotProps={{ label: { sx: { lineHeight: 0 } } }}
        sx={{ ml: 2, height: '48px', alignItems: 'center', borderRadius: '27px' }}
        icon={
          <Avatar
            src={avatarSrc}
            alt="user-images"
            onError={() => setAvatarLoadFailed(true)}
            sx={{ typography: 'mediumAvatar', margin: '8px 0 8px 8px !important', cursor: 'pointer' }}
            ref={anchorRef}
            aria-controls={open ? 'menu-list-grow' : undefined}
            aria-haspopup="true"
            color="inherit"
          />
        }
        label={<IconSettings stroke={1.5} size="24px" />}
        ref={anchorRef}
        aria-controls={open ? 'menu-list-grow' : undefined}
        aria-haspopup="true"
        onClick={handleToggle}
        color="secondary"
        aria-label="user-account"
      />
      <Popper
        placement="bottom"
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, 14]
            }
          }
        ]}
      >
        {({ TransitionProps }) => (
          <ClickAwayListener onClickAway={handleClose}>
            <Transitions in={open} {...TransitionProps}>
              <Paper>
                {open && (
                  <MainCard border={false} elevation={16} content={false} boxShadow shadow={theme.shadows[16]}>
                    <Box sx={{ p: 2, pb: 0 }}>
                      <Stack>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="h4">Signed in as</Typography>
                          <Typography component="span" variant="h4" sx={{ fontWeight: 400 }}>
                            {displayName}
                          </Typography>
                        </Stack>
                        <Typography variant="subtitle2">{roleName ?? 'Unknown role'}</Typography>
                      </Stack>
                      {/* <OutlinedInput
                        sx={{ width: '100%', pr: 1, pl: 2, my: 2 }}
                        id="input-search-profile"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Search profile options"
                        startAdornment={
                          <InputAdornment position="start">
                            <IconSearch stroke={1.5} size="16px" />
                          </InputAdornment>
                        }
                        aria-describedby="search-helper-text"
                        slotProps={{ input: { 'aria-label': 'weight' } }}
                      /> */}
                      {/* <Divider /> */}
                    </Box>
                    <Box
                      sx={{
                        p: 2,
                        py: 0,
                        height: '100%',
                        maxHeight: 'calc(100vh - 250px)',
                        overflowX: 'hidden',
                        '&::-webkit-scrollbar': { width: 5 }
                      }}
                    >
                      {/* <UpgradePlanCard /> */}
                      <br />
                      <Divider />
                      {/* <Card sx={{ bgcolor: 'primary.light', my: 2 }}>
                        <CardContent>
                          <Stack sx={{ gap: 3 }}>
                            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="subtitle1">Start DND Mode</Typography>
                              <Switch color="primary" checked={sdm} onChange={(e) => setSdm(e.target.checked)} name="sdm" size="small" />
                            </Stack>
                            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="subtitle1">Allow Notifications</Typography>
                              <Switch checked={notification} onChange={(e) => setNotification(e.target.checked)} name="sdm" size="small" />
                            </Stack>
                          </Stack>
                        </CardContent>
                      </Card> */}
                      {/* <Divider /> */}
                      <List
                        component="nav"
                        sx={{
                          width: '100%',
                          maxWidth: 350,
                          minWidth: 300,
                          borderRadius: `${borderRadius}px`,
                          '& .MuiListItemButton-root': { mt: 0.5 }
                        }}
                      >
                        <ListItemButton
                          sx={{ borderRadius: `${borderRadius}px` }}
                          onClick={() => {
                            setOpen(false);
                            navigate('/account/profile');
                          }}
                        >
                          <ListItemIcon>
                            <IconSettings stroke={1.5} size="20px" />
                          </ListItemIcon>
                          <ListItemText primary={<Typography variant="body2">Account Settings</Typography>} />
                        </ListItemButton>
                        <ListItemButton
                          sx={{ borderRadius: `${borderRadius}px` }}
                          onClick={() => {
                            setOpen(false);
                            navigate('/account/profile?tab=security');
                          }}
                        >
                          <ListItemIcon>
                            <IconShieldLock stroke={1.5} size="20px" />
                          </ListItemIcon>
                          <ListItemText primary={<Typography variant="body2">Security Settings</Typography>} />
                        </ListItemButton>
                        <ListItemButton sx={{ borderRadius: `${borderRadius}px` }} onClick={handleLogout} disabled={logoutLoading}>
                          <ListItemIcon>
                            <IconLogout stroke={1.5} size="20px" />
                          </ListItemIcon>
                          <ListItemText primary={<Typography variant="body2">{logoutLoading ? 'Logging out...' : 'Logout'}</Typography>} />
                        </ListItemButton>
                        {logoutError ? (
                          <Typography variant="caption" color="error" sx={{ display: 'block', px: 2, pb: 1 }}>
                            {logoutError}
                          </Typography>
                        ) : null}
                      </List>
                    </Box>
                  </MainCard>
                )}
              </Paper>
            </Transitions>
          </ClickAwayListener>
        )}
      </Popper>
    </>
  );
}
