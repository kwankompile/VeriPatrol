"""Unit tests for camera credential login and token cache (M3)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib import error

import pytest

from backend import BackendApiError, BackendClient, BackendToken


def _camera_login_response(
    *,
    token: str = "camera-jwt",
    camera_id: str = "11111111-1111-1111-1111-111111111111",
    camera_name: str = "Gate Camera 1",
) -> bytes:
    return json.dumps(
        {
            "success": True,
            "message": "Camera authenticated successfully.",
            "data": {
                "access_token": token,
                "token_type": "bearer",
                "expires_in": 3600,
                "camera": {
                    "id": camera_id,
                    "name": camera_name,
                    "rtsp_url": "rtsp://camera.local/stream",
                },
            },
        }
    ).encode("utf-8")


def _mock_urlopen_response(body: bytes, *, status: int = 200):
    response = MagicMock()
    response.read.return_value = body
    response.__enter__ = MagicMock(return_value=response)
    response.__exit__ = MagicMock(return_value=False)
    return response


class TestCameraLogin:
    def test_login_posts_to_camera_auth_login(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        captured: dict = {}

        def fake_urlopen(request, timeout=10):
            captured["url"] = request.full_url
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return _mock_urlopen_response(_camera_login_response())

        with patch("backend.request.urlopen", side_effect=fake_urlopen):
            client.login()

        assert captured["url"].endswith("/camera-auth/login")
        assert "/auth/login" not in captured["url"]
        assert captured["body"]["email"] == backend_enabled_config.camera_email
        assert captured["body"]["password"] == backend_enabled_config.camera_password
        assert captured["body"]["rtsp_url"] == backend_enabled_config.rtsp_url

    def test_login_caches_token_and_camera_identity(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)

        with patch(
            "backend.request.urlopen",
            return_value=_mock_urlopen_response(_camera_login_response()),
        ):
            token = client.login()

        assert token.access_token == "camera-jwt"
        cache = client._read_token_cache()
        assert cache["camera_id"] == "11111111-1111-1111-1111-111111111111"
        assert cache["camera_name"] == "Gate Camera 1"

    def test_cached_valid_token_is_reused_without_login(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        client.save_token(
            BackendToken(access_token="cached", token_type="bearer", expires_at=expires),
            camera_id="11111111-1111-1111-1111-111111111111",
            camera_name="Cached Camera",
        )

        with patch("backend.request.urlopen") as mock_urlopen:
            token = client.get_valid_token()

        mock_urlopen.assert_not_called()
        assert token.access_token == "cached"

    def test_expired_token_triggers_camera_login(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        expires = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        client.save_token(
            BackendToken(access_token="expired", token_type="bearer", expires_at=expires),
            camera_id="11111111-1111-1111-1111-111111111111",
        )

        with patch(
            "backend.request.urlopen",
            return_value=_mock_urlopen_response(_camera_login_response(token="fresh-jwt")),
        ) as mock_urlopen:
            token = client.get_valid_token()

        mock_urlopen.assert_called_once()
        assert token.access_token == "fresh-jwt"

    def test_old_cache_without_camera_identity_forces_login(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        client.save_token(
            BackendToken(access_token="legacy", token_type="bearer", expires_at=expires),
        )

        with patch(
            "backend.request.urlopen",
            return_value=_mock_urlopen_response(_camera_login_response(token="new-jwt")),
        ) as mock_urlopen:
            token = client.get_valid_token()

        mock_urlopen.assert_called_once()
        assert token.access_token == "new-jwt"

    def test_authorized_request_401_triggers_relogin_once(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        client.save_token(
            BackendToken(access_token="stale", token_type="bearer", expires_at=expires),
            camera_id="11111111-1111-1111-1111-111111111111",
        )

        login_calls = {"count": 0}
        request_calls = {"count": 0}

        def fake_urlopen(request, timeout=10):
            if request.full_url.endswith("/camera-auth/login"):
                login_calls["count"] += 1
                return _mock_urlopen_response(_camera_login_response(token="refreshed-jwt"))

            request_calls["count"] += 1
            if request_calls["count"] == 1:
                raise error.HTTPError(
                    request.full_url,
                    401,
                    "Unauthorized",
                    hdrs=None,
                    fp=BytesIO(b'{"message":"Unauthenticated."}'),
                )
            return _mock_urlopen_response(json.dumps({"data": {"id": "evt-1"}}).encode("utf-8"))

        with patch("backend.request.urlopen", side_effect=fake_urlopen):
            response = client._request("POST", "/anpr-events", {"plate_number": "ABC1234"}, headers={})

        assert login_calls["count"] == 1
        assert request_calls["count"] == 2
        assert response["data"]["id"] == "evt-1"

    def test_invalid_camera_credentials_return_safe_error(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)

        def fake_urlopen(request, timeout=10):
            raise error.HTTPError(
                request.full_url,
                401,
                "Unauthorized",
                hdrs=None,
                fp=BytesIO(b'{"message":"Invalid credentials."}'),
            )

        with patch("backend.request.urlopen", side_effect=fake_urlopen):
            with pytest.raises(BackendApiError) as exc_info:
                client.login()

        message = exc_info.value.message
        assert "Camera authentication failed" in message
        assert backend_enabled_config.camera_password not in message
        assert "/auth/login" not in exc_info.value.path

    def test_no_code_path_calls_auth_login(self, backend_enabled_config):
        client = BackendClient(backend_enabled_config)
        requested_paths: list[str] = []

        def fake_urlopen(request, timeout=10):
            requested_paths.append(request.full_url)
            if request.full_url.endswith("/camera-auth/login"):
                return _mock_urlopen_response(_camera_login_response())
            return _mock_urlopen_response(json.dumps({"data": {"id": "evt-1"}}).encode("utf-8"))

        with patch("backend.request.urlopen", side_effect=fake_urlopen):
            client.login()
            client._request("POST", "/anpr-events", {"plate_number": "ABC1234"}, headers={})

        assert not any("/auth/login" in path for path in requested_paths)
