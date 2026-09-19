import PropTypes from 'prop-types';

// material-ui
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';

import { Box, Button } from '@mui/material';
import { IconArrowLeft as BackIcon } from '@tabler/icons-react';

// constant
const headerStyle = {
  '& .MuiCardHeader-action': { mr: 0 }
};

export default function DetailCard({
  border = false,
  boxShadow,
  children,
  content = true,
  contentClass = '',
  contentSX = {},
  headerSX = {},
  darkTitle,
  avatar,
  secondary,
  onBack,
  headerActions,
  shadow,
  sx = {},
  title,
  ref,
  ...others
}) {
  const defaultShadow = '0 2px 14px 0 rgb(32 40 45 / 8%)';

  return (
    <Card
      ref={ref}
      {...others}
      sx={(theme) => ({
        border: border ? '1px solid' : 'none',
        borderColor: 'divider',
        ':hover': {
          boxShadow: boxShadow ? shadow || defaultShadow : 'inherit'
        },
        ...(typeof sx === 'function' ? sx(theme) : sx || {})
      })}
    >
      {/* card header and action */}
      {!darkTitle && title && (
        <CardHeader
          sx={{ ...headerStyle, ...headerSX }}
          avatar={avatar}
          title={title}
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {headerActions}
              {onBack ? (
                <Button variant="outlined" color="secondary" onClick={onBack} startIcon={<BackIcon size={18} />}>
                  Back
                </Button>
              ) : null}
            </Box>
          }
        />
      )}

      {darkTitle && title && (
        <CardHeader sx={{ ...headerStyle, ...headerSX }} title={<Typography variant="h3">{title}</Typography>} action={secondary} />
      )}

      {/* content & header divider */}
      {title && <Divider />}

      {/* card content */}
      {content && (
        <CardContent sx={contentSX} className={contentClass}>
          {children}
        </CardContent>
      )}
      {!content && children}
    </Card>
  );
}

DetailCard.propTypes = {
  border: PropTypes.bool,
  boxShadow: PropTypes.bool,
  children: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  content: PropTypes.bool,
  contentClass: PropTypes.string,
  contentSX: PropTypes.object,
  headerSX: PropTypes.object,
  darkTitle: PropTypes.bool,
  avatar: PropTypes.node,
  secondary: PropTypes.any,
  onBack: PropTypes.func,
  headerActions: PropTypes.node,
  shadow: PropTypes.string,
  sx: PropTypes.object,
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  ref: PropTypes.object,
  others: PropTypes.any
};
