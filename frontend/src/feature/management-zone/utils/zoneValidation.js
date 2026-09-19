export function validateZoneForm(formData) {
  const errors = {};

  const name = String(formData.name ?? '').trim();
  if (!name) {
    errors.name = 'Name is required';
  } else if (name.length > 255) {
    errors.name = 'Name must be at most 255 characters';
  }

  const description = formData.description == null ? '' : String(formData.description);
  if (description.length > 1000) {
    errors.description = 'Description must be at most 1000 characters';
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function buildZonePayload(formData) {
  const description = String(formData.description ?? '').trim();

  return {
    name: String(formData.name).trim(),
    description: description === '' ? null : description
  };
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
