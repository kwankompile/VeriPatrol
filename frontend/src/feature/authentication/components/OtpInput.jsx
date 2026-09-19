import FormHelperText from '@mui/material/FormHelperText';
import OutlinedInput from '@mui/material/OutlinedInput';
import Box from '@mui/material/Box';

import CustomFormControl from 'ui-component/extended/Form/CustomFormControl';

export default function OtpInput({ value, onChange, disabled = false, error = false, helperText = '', id = 'otp-input' }) {
  const handleChange = (event) => {
    const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 6);
    onChange(digitsOnly);
  };

  return (
    <CustomFormControl fullWidth error={error}>
      <OutlinedInput
        id={id}
        inputProps={{
          inputMode: 'numeric',
          pattern: '[0-9]*',
          maxLength: 6,
          'aria-label': 'Authentication code'
        }}
        placeholder="000000"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoComplete="one-time-code"
      />
      {helperText ? <FormHelperText error={error}>{helperText}</FormHelperText> : null}
    </CustomFormControl>
  );
}
