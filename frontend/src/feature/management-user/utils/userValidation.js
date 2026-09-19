export function validateUserForm(formData, { requirePassword = false } = {}) {
  const errors = {};

  const name = String(formData.name ?? '').trim();
  if (!name) {
    errors.name = 'Name is required';
  } else if (name.length > 255) {
    errors.name = 'Name must be at most 255 characters';
  }

  const email = String(formData.email ?? '').trim();
  if (!email) {
    errors.email = 'Email is required';
  } else if (!/\S+@\S+\.\S+/.test(email)) {
    errors.email = 'Email is invalid';
  }

  const phone = String(formData.phone ?? '').trim();
  if (phone && !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) {
    errors.phone = 'Phone number must be 10–15 digits';
  }

  const address = String(formData.address ?? '').trim();
  if (address.length > 2000) {
    errors.address = 'Address must be at most 2000 characters';
  }

  if (!String(formData.role_id ?? '').trim()) {
    errors.role_id = 'Role is required';
  }

  const password = String(formData.password ?? '');
  if (requirePassword && !password.trim()) {
    errors.password = 'Password is required';
  } else if (password.trim() && password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function buildUserPayload(formData, { includePassword = true } = {}) {
  const payload = {
    name: String(formData.name).trim(),
    email: String(formData.email).trim(),
    role_id: formData.role_id
  };

  const phone = String(formData.phone ?? '').trim();
  payload.phone = phone === '' ? null : phone;

  const address = String(formData.address ?? '').trim();
  payload.address = address === '' ? null : address;

  const password = String(formData.password ?? '').trim();
  if (includePassword && password) {
    payload.password = password;
  }

  return payload;
}

export function extractBackendValidationErrors(error) {
  return error?.validationErrors || error?.data?.data?.errors || error?.data?.errors || null;
}

export function normalizeValidationErrorsForForm(validationErrors) {
  if (!validationErrors || typeof validationErrors !== 'object') return {};
  return Object.entries(validationErrors).reduce((acc, [field, messages]) => {
    acc[field] = Array.isArray(messages) ? messages[0] : messages;
    return acc;
  }, {});
}

export function extractBackendErrorMessage(error, fallback = 'Request failed.') {
  const validationErrors = extractBackendValidationErrors(error);
  if (validationErrors && typeof validationErrors === 'object') {
    const firstFieldErrors = Object.values(validationErrors).find((messages) => Array.isArray(messages) && messages.length > 0);
    if (Array.isArray(firstFieldErrors)) return firstFieldErrors[0];
  }
  return error?.data?.message || error?.message || fallback;
}

export function mapRolesToOptions(roles = []) {
  return roles.map((role) => ({
    value: role.id,
    label: role.name
  }));
}
