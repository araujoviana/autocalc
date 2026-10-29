"""The calculator's saved lists: a logged-in session that creates/updates/deletes them, and the anonymous share/detail read."""

from __future__ import annotations

from typing import Any

import httpx

from autocalc.client import CALC, Calculator, CalculatorError
from autocalc.errors import AuthExpired, UnexpectedResponse, UpstreamError, ValidationError

SHARE_URL = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html?shareListId={id}&currentCurrency=USD"


def session_headers(cookie: str) -> dict[str, str]:
    """Use the same request identity for authentication probes and list mutations."""
    headers = {"cookie": cookie, "user-agent": "Mozilla/5.0", "origin": "https://www.huaweicloud.com",
               "referer": "https://www.huaweicloud.com/", "content-type": "application/json"}
    for part in cookie.split(";"):
        key, _, value = part.strip().partition("=")
        if key == "csrf":
            headers["csrf"] = value
    return headers


class Session:
    """Logged-in calculator session.

    Cookies come from the browser profile (``auth.session_cookies``, read once per process);
    ``cookie_header`` overrides that for tests. ``transport`` is an httpx transport for tests.
    """

    def __init__(self, cookie_header: str | None = None, *, transport: Any = None):
        from autocalc import auth

        self._transport = transport
        self._explicit_cookie = cookie_header is not None
        self.http = self._client(cookie_header if self._explicit_cookie else auth.session_cookies())

    def _client(self, cookie: str) -> Any:
        import httpx

        headers = session_headers(cookie)
        return httpx.Client(headers=headers, timeout=60, transport=self._transport)

    def _call(self, method: str, path: str, params: dict | None = None, body: Any = None,
              _retry: bool = True) -> dict[str, Any]:
        try:
            r = self.http.request(method, f"{CALC}/{path}", params=params, json=body)
        except httpx.HTTPError as exc:
            raise UpstreamError(f"{path}: request failed; the remote outcome may be unknown.") from exc
        try:
            data = r.json()
        except ValueError as err:
            raise UnexpectedResponse(f"{path}: HTTP {r.status_code} returned invalid JSON.") from err
        if not isinstance(data, dict):
            raise UnexpectedResponse(f"{path}: expected an object response.")
        code = str(data.get("retCode", "200"))
        if code == "CBC.0101" and _retry and not self._explicit_cookie:
            # session went stale -> re-read the browser profile once, then retry
            self._renew()
            return self._call(method, path, params, body, _retry=False)
        if r.status_code != 200 or code != "200":
            if code == "CBC.0101":
                raise AuthExpired("Calculator session is not valid.",
                                  hint="Run `autocalc login` to sign in again.")
            raise CalculatorError(f"{path}: HTTP {r.status_code} {data}")
        return data

    def _renew(self) -> None:
        from autocalc import auth

        self.http = self._client(auth.session_cookies(refresh=True))

    def lists(self) -> list[dict[str, Any]]:
        return self._call("GET", "share/list").get("lists", [])

    def create(self, payload: dict[str, Any]) -> str:
        list_id = self._call("POST", "share/add", body=payload)["data"]
        return list_id

    def update(self, list_id: str, payload: dict[str, Any]) -> None:
        self._call("POST", "share/update", params={"key": list_id}, body=payload)

    def copy(self, list_id: str) -> str:
        """Copy an owned saved list using the authenticated copy endpoint."""
        data = self._call("POST", "share/copy", params={"key": list_id}).get("data")
        if not isinstance(data, str) or not data:
            raise UnexpectedResponse("share/copy returned no list id.")
        return data

    def delete(self, list_id: str) -> None:
        self._call("POST", "share/delete", params={"key": list_id})


def share_detail(calc: Calculator, list_id: str) -> dict[str, Any]:
    try:
        r = calc.http.get(f"{CALC}/share/detail", params={"key": list_id, "language": "en-us"})
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPError as exc:
        raise UpstreamError("Could not read the shared list.") from exc
    except ValueError as exc:
        raise UnexpectedResponse("share/detail returned invalid JSON.") from exc
    if not isinstance(data, dict):
        raise UnexpectedResponse("share/detail returned an invalid payload.")
    if str(data.get("retCode")) != "200":
        raise ValidationError("The shared list key is invalid or unavailable.", field="list_id")
    if not isinstance(data.get("data"), dict):
        raise UnexpectedResponse("share/detail did not return list data.")
    return data["data"]
