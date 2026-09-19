const MALAYSIA_DATETIME_FORMATTER = new Intl.DateTimeFormat('en-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  dateStyle: 'medium',
  timeStyle: 'short'
});

const parseDateSafely = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export function MalaysiaTime({ time, fallback = '-' }) {
  const parsedDate = parseDateSafely(time);

  if (!parsedDate) {
    return fallback;
  }

  return MALAYSIA_DATETIME_FORMATTER.format(parsedDate);
}
