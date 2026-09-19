import React from 'react';
import { Box, TextField, MenuItem, Typography, alpha, styled, useTheme } from '@mui/material';

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

const StyledTextField = styled(TextField)(({ theme }) => ({
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
    padding: '16px 14px'
  }
}));

export const SelectFieldContainer = React.forwardRef(
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
      options = [],
      placeholder = 'Select an option',
      icon,
      sx,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();

    return (
      <Box sx={sx}>
        <Field>
          <StyledTextField
            select
            fullWidth={fullWidth}
            label={label}
            name={name}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            error={error}
            helperText={helperText}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            ref={ref}
            {...props}
          >
            {placeholder && (
              <MenuItem value="" disabled>
                <Typography color="text.secondary">{placeholder}</Typography>
              </MenuItem>
            )}

            {options.map((option) => (
              <MenuItem
                key={option.value}
                value={option.value}
                sx={{
                  py: 1.5,
                  px: 2,
                  borderRadius: 1,
                  mx: 1,
                  my: 0.5,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.secondary.main, 0.08),
                    transform: 'translateX(4px)'
                  },
                  '&.Mui-selected': {
                    backgroundColor: alpha(theme.palette.secondary.main, 0.12),
                    fontWeight: 600
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {option.icon && <Box sx={{ fontSize: '1.25rem' }}>{option.icon}</Box>}
                  <Typography variant="body1">{option.label}</Typography>
                </Box>
              </MenuItem>
            ))}
          </StyledTextField>
          {icon && <Box className="field-icon">{icon}</Box>}
        </Field>
      </Box>
    );
  }
);

SelectFieldContainer.displayName = 'SelectFieldContainer';

// Export as default as well
export default SelectFieldContainer;
