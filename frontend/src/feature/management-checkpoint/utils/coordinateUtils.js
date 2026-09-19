const DECIMAL_LIMIT = 7;
const MAX_COORDINATE_LENGTH = 10;

const RANGE_BY_KIND = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 }
};

const sanitizeNumericString = (value) => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';

  let output = '';
  let hasDot = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char >= '0' && char <= '9') {
      output += char;
      continue;
    }

    if (char === '-' && output.length === 0) {
      output += char;
      continue;
    }

    if (char === '.' && !hasDot) {
      output += char;
      hasDot = true;
    }
  }

  return output;
};

const trimFraction = (numeric) =>
  numeric
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '')
    .replace(/\.$/u, '');

const limitCoordinateLength = (value) => {
  if (value.length <= MAX_COORDINATE_LENGTH) return value;

  const isNegative = value.startsWith('-');
  const unsigned = isNegative ? value.slice(1) : value;
  const [integerPartRaw, fractionPartRaw = ''] = unsigned.split('.');
  const integerPart = integerPartRaw || '0';
  const signPrefix = isNegative ? '-' : '';

  const baseLength = signPrefix.length + integerPart.length;
  if (baseLength >= MAX_COORDINATE_LENGTH) {
    return `${signPrefix}${integerPart.slice(0, MAX_COORDINATE_LENGTH - signPrefix.length)}`;
  }

  const decimalsAllowed = Math.min(DECIMAL_LIMIT, Math.max(0, MAX_COORDINATE_LENGTH - baseLength - 1));

  if (decimalsAllowed === 0) {
    return `${signPrefix}${integerPart}`;
  }

  return trimFraction(`${signPrefix}${integerPart}.${fractionPartRaw.slice(0, decimalsAllowed)}`);
};

/**
 * Normalize coordinate inputs to safe, bounded values.
 * - Supports both string and number input.
 * - Clamps range by coordinate type.
 * - Limits decimals to 7 and resulting representation to <= 10 chars when possible.
 */
export function normalizeCoordinate(value, kind, { asNumber = false } = {}) {
  const range = RANGE_BY_KIND[kind];
  if (!range) {
    return asNumber ? null : '';
  }

  if (value === '' || value == null) {
    return asNumber ? null : '';
  }

  const sanitized = sanitizeNumericString(value);
  if (!sanitized || sanitized === '-' || sanitized === '.' || sanitized === '-.') {
    return asNumber ? null : '';
  }

  let numeric = Number(sanitized);
  if (!Number.isFinite(numeric)) {
    return asNumber ? null : '';
  }

  numeric = Math.max(range.min, Math.min(range.max, numeric));
  numeric = Number(numeric.toFixed(DECIMAL_LIMIT));

  const fixed = numeric.toFixed(DECIMAL_LIMIT);
  const normalized = limitCoordinateLength(trimFraction(fixed));
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return asNumber ? null : '';
  }

  return asNumber ? parsed : normalized;
}
