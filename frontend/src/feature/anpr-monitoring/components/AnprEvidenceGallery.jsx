import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Card, CardContent, CardMedia, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { IconPhotoOff } from '@tabler/icons-react';

import { getAuthToken } from 'utils/auth';

const IMAGE_TYPE_LABELS = {
  full: 'Full frame',
  plate: 'Plate crop',
  annotated: 'Annotated'
};

const PROTECTED_FILE_PATTERN = /\/anpr-images\/[^/]+\/file(?:\?|$)/i;

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function requiresAuthenticatedFetch(url) {
  return Boolean(url && PROTECTED_FILE_PATTERN.test(url));
}

function UnavailablePreview() {
  return (
    <Box
      sx={{
        height: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.50',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Stack spacing={1} alignItems="center" sx={{ px: 2, textAlign: 'center' }}>
        <IconPhotoOff size={36} stroke={1.25} opacity={0.5} />
        <Typography variant="body2" color="text.secondary">
          Preview unavailable
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Evidence is shown when Laravel can resolve the file under configured ANPR image roots.
        </Typography>
      </Stack>
    </Box>
  );
}

function EvidencePreview({ previewUrl, alt, onFailed }) {
  const [resolvedSrc, setResolvedSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;

    setResolvedSrc(null);
    setLoading(true);

    if (!previewUrl) {
      setLoading(false);
      onFailed?.();
      return undefined;
    }

    if (!requiresAuthenticatedFetch(previewUrl)) {
      setResolvedSrc(previewUrl);
      setLoading(false);
      return undefined;
    }

    const token = getAuthToken();
    fetch(previewUrl, {
      headers: {
        Accept: 'image/*,*/*',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load protected evidence image');
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          onFailed?.();
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [previewUrl, onFailed]);

  if (loading) {
    return (
      <Box
        sx={{
          height: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.50',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!resolvedSrc) {
    return null;
  }

  return <CardMedia component="img" image={resolvedSrc} alt={alt} sx={{ height: 200, objectFit: 'cover', bgcolor: 'grey.100' }} />;
}

EvidencePreview.propTypes = {
  previewUrl: PropTypes.string,
  alt: PropTypes.string.isRequired,
  onFailed: PropTypes.func
};

function EvidenceCard({ imageType, image }) {
  const label = IMAGE_TYPE_LABELS[imageType] ?? imageType;
  const previewUrl = image?.previewUrl ?? null;
  const [previewFailed, setPreviewFailed] = useState(!previewUrl);

  useEffect(() => {
    setPreviewFailed(!previewUrl);
  }, [previewUrl, image?.id]);

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      {previewFailed ? (
        <UnavailablePreview />
      ) : (
        <EvidencePreview previewUrl={previewUrl} alt={`${label} evidence`} onFailed={() => setPreviewFailed(true)} />
      )}

      <CardContent>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1">{label}</Typography>
            <Chip size="small" label={imageType} variant="outlined" />
          </Stack>

          {image ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                Path: {image.filePath ?? '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Size: {formatFileSize(image.fileSize)} · Resolution: {image.resolution ?? '—'}
              </Typography>
              {image.expiresAt ? (
                <Typography variant="caption" color="text.secondary">
                  Expires: {image.expiresAt}
                </Typography>
              ) : null}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No {label.toLowerCase()} image registered for this event.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

EvidenceCard.propTypes = {
  imageType: PropTypes.string.isRequired,
  image: PropTypes.object
};

export default function AnprEvidenceGallery({ images = [], imageMap = {} }) {
  const orderedTypes = ['full', 'plate', 'annotated'];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Evidence gallery
      </Typography>
      <Grid container spacing={2}>
        {orderedTypes.map((imageType) => {
          const image = imageMap[imageType] ?? images.find((item) => item.imageType === imageType) ?? null;
          return (
            <Grid key={imageType} size={{ xs: 12, md: 4 }}>
              <EvidenceCard imageType={imageType} image={image} />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

AnprEvidenceGallery.propTypes = {
  images: PropTypes.arrayOf(PropTypes.object),
  imageMap: PropTypes.object
};
