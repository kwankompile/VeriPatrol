export let ImagePath;

(function (ImagePath) {
  ImagePath['TESTAMENTS'] = 'testaments';
  ImagePath['USERS'] = 'users';
  ImagePath['ECOMMERCE'] = 'e-commerce';
  ImagePath['PROFILE'] = 'profile';
  ImagePath['BLOG'] = 'blog';
})(ImagePath || (ImagePath = {}));

// ==============================|| NEW URL - GET IMAGE URL ||============================== //

export function getImageUrl(name, path) {
  return new URL(`/src/assets/images/${path}/${name}`, import.meta.url).href;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

function getApiOrigin() {
  try {
    const url = new URL(API_BASE_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'http://localhost:8000';
  }
}

/**
 * Resolve profile picture URLs from the API into browser-loadable absolute URLs.
 * Backend returns stable relative `/storage/...` paths for managed uploads.
 */
export function resolveProfilePictureUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('/storage/')) {
    return `${getApiOrigin()}${trimmed}`;
  }

  if (trimmed.startsWith('http://localhost/storage/')) {
    return `${getApiOrigin()}${trimmed.slice('http://localhost'.length)}`;
  }

  if (trimmed.startsWith('https://localhost/storage/')) {
    return `${getApiOrigin()}${trimmed.slice('https://localhost'.length)}`;
  }

  return trimmed;
}
