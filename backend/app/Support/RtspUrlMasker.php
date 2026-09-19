<?php

namespace App\Support;

class RtspUrlMasker
{
    public static function mask(?string $url): ?string
    {
        if ($url === null || $url === '') {
            return null;
        }

        $parts = parse_url($url);

        if ($parts === false || ! isset($parts['host'])) {
            return $url;
        }

        $scheme = $parts['scheme'] ?? 'rtsp';
        $host = $parts['host'];
        $port = isset($parts['port']) ? ':'.$parts['port'] : '';
        $path = $parts['path'] ?? '';
        $query = isset($parts['query']) ? '?'.$parts['query'] : '';

        return sprintf('%s://%s%s%s%s', $scheme, $host, $port, $path, $query);
    }

    public static function containsEmbeddedCredentials(?string $url): bool
    {
        if ($url === null || $url === '') {
            return false;
        }

        $parts = parse_url($url);

        return $parts !== false && (isset($parts['user']) || isset($parts['pass']));
    }
}
