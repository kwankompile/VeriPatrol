import { alpha, Box, styled, TextField } from '@mui/material';

const Field = styled(Box)(({ theme }) => ({
  position: 'relative',
  // marginBottom: theme.spacing(2.5),
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

export function FieldContainer({
  type,
  label,
  name,
  placeholder,
  value,
  onChange,
  error,
  helperText,
  multiline,
  minRows,
  maxRows,
  notRequired,
  required = true
}) {
  // const required = notRequired ? false : true;

  return (
    <Box>
      <Field>
        <StyledTextField
          fullWidth
          type={type}
          label={label}
          name={name}
          value={value}
          onChange={onChange}
          error={error}
          helperText={helperText}
          required={notRequired ? false : required}
          placeholder={placeholder}
          multiline={multiline}
          minRows={minRows}
          maxRows={maxRows}
        />
      </Field>
    </Box>
  );
}
