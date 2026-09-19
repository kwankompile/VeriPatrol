import React from 'react';
import { Box, alpha, styled, useTheme, InputAdornment } from '@mui/material';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

const Field = styled(Box)(({ theme }) => ({
  position: 'relative',
  '& .field-icon': {
    position: 'absolute',
    top: '50%',
    right: 14,
    transform: 'translateY(-50%)',
    color: theme.palette.text.secondary,
    pointerEvents: 'none',
    zIndex: 1,
    opacity: 0.5,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  },
  '&:hover .field-icon': {
    opacity: 1,
    color: theme.palette.secondary.main,
    transform: 'translateY(-50%) scale(1.1)'
  }
}));

const StyledTimePicker = styled(TimePicker)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 12,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    backgroundColor: theme.palette.background.paper,
    '&:hover': {
      backgroundColor: alpha(theme.palette.secondary.main, 0.02),
      transform: 'translateY(-1px)',
      boxShadow: `0 4px 12px ${alpha(theme.palette.secondary.main, 0.08)}`,
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.secondary.main,
        borderWidth: 2
      }
    },
    '&.Mui-focused': {
      backgroundColor: alpha(theme.palette.secondary.main, 0.04),
      transform: 'translateY(-1px)',
      boxShadow: `0 4px 16px ${alpha(theme.palette.secondary.main, 0.12)}`,
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.secondary.main,
        borderWidth: 2
      }
    }
  },
  '& .MuiInputLabel-root': {
    fontWeight: 500,
    '&.Mui-focused': {
      fontWeight: 600,
      color: theme.palette.secondary.main
    }
  },
  '& .MuiOutlinedInput-input': {
    padding: '16px 14px',
    cursor: 'pointer'
  },
  '& .MuiIconButton-root': {
    color: theme.palette.text.secondary,
    '&:hover': {
      color: theme.palette.secondary.main,
      backgroundColor: alpha(theme.palette.secondary.main, 0.08)
    }
  }
}));

export const TimePickerFieldContainer = React.forwardRef(
  (
    {
      label,
      name,
      value,
      onChange,
      onBlur,
      error,
      helperText,
      required = true,
      disabled = false,
      fullWidth = true,
      placeholder = 'Select time',
      icon,
      sx,
      minTime,
      maxTime,
      ampm = true,
      format = 'hh:mm a',
      views = ['hours', 'minutes'],
      minutesStep = 5,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();

    const handleChange = (newValue) => {
      onChange({
        target: {
          name,
          value: newValue
        }
      });
    };

    const handleBlur = () => {
      if (onBlur) {
        onBlur({
          target: {
            name
          }
        });
      }
    };

    return (
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Box sx={sx}>
          <Field>
            <StyledTimePicker
              label={label}
              value={value}
              onChange={handleChange}
              onClose={handleBlur}
              disabled={disabled}
              ampm={ampm}
              format={format}
              views={views}
              minutesStep={minutesStep}
              minTime={minTime}
              maxTime={maxTime}
              slotProps={{
                textField: {
                  fullWidth,
                  error,
                  helperText,
                  required,
                  name,
                  placeholder,
                  ref,
                  onBlur: handleBlur,
                  InputProps: {
                    endAdornment: icon && (
                      <InputAdornment position="end">
                        <Box className="field-icon">{icon}</Box>
                      </InputAdornment>
                    )
                  },
                  ...props
                },
                popper: {
                  sx: {
                    '& .MuiPaper-root': {
                      borderRadius: 12,
                      boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.1)}`,
                      marginTop: 1
                    },
                    '& .MuiPickersLayout-root': {
                      '& .MuiPickersLayout-actionBar': {
                        padding: 2,
                        '& .MuiButton-root': {
                          borderRadius: 8,
                          fontWeight: 600,
                          textTransform: 'none',
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.secondary.main, 0.08)
                          }
                        }
                      }
                    },
                    '& .MuiTimePickerToolbar-hourMinuteLabel': {
                      '& .MuiTypography-root': {
                        fontSize: '3rem',
                        fontWeight: 600,
                        color: theme.palette.text.primary
                      }
                    },
                    '& .MuiClock-root': {
                      '& .MuiClockPointer-root': {
                        backgroundColor: theme.palette.secondary.main
                      },
                      '& .MuiClock-pin': {
                        backgroundColor: theme.palette.secondary.main
                      }
                    }
                  }
                }
              }}
            />
          </Field>
        </Box>
      </LocalizationProvider>
    );
  }
);

TimePickerFieldContainer.displayName = 'TimePickerFieldContainer';

// Export as default as well
export default TimePickerFieldContainer;
