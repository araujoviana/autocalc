"""Typed error model for autocalc.

Every failure carries a human/agent-actionable ``hint`` so MCP callers can tell
the user exactly what to do next (run ``autocalc login``, pick another region...).
"""

from __future__ import annotations

from typing import Any


class CalculatorError(RuntimeError):
    """Base class. Kept for backwards compatibility with the original module."""

    code = "AUTOCALC"

    def __init__(self, message: str, *, hint: str | None = None, code: str | None = None, details: dict[str, Any] | None = None):
        self.hint = hint
        self.details = details or {}
        if code:
            self.code = code
        text = message
        if hint and hint not in message:
            text = f"{message}\nHint: {hint}"
        super().__init__(text)
        self.message = message

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"error": self.code, "message": self.message}
        if self.hint:
            out["hint"] = self.hint
        if self.details:
            out["details"] = self.details
        return out


# ---- catalog / validation ---------------------------------------------------


class ValidationError(CalculatorError):
    code = "VALIDATION"

    def __init__(self, message: str, *, field: str | None = None, allowed: list[Any] | None = None, **kw: Any):
        details = dict(kw.pop("details", {}) or {})
        if field:
            details["field"] = field
        if allowed:
            details["allowed"] = allowed
        hint = kw.pop("hint", None)
        if allowed and not hint:
            hint = f"Valid {field or 'values'}: {', '.join(map(str, allowed))}"
        super().__init__(message, hint=hint, details=details, **kw)


class SpecNotFound(CalculatorError):
    code = "SPEC_NOT_FOUND"


class ServiceNotSold(CalculatorError):
    code = "SERVICE_NOT_SOLD"


class ModeNotOffered(CalculatorError):
    code = "MODE_NOT_OFFERED"


class RegionNotFound(CalculatorError):
    code = "REGION_NOT_FOUND"


class RegionAmbiguous(CalculatorError):
    code = "REGION_AMBIGUOUS"

    def __init__(self, query: str, choices: list[str], **kw: Any):
        self.choices = choices
        super().__init__(
            f"Region {query!r} is ambiguous.",
            hint="Pick one of: " + ", ".join(choices),
            details={"query": query, "choices": choices},
            **kw,
        )


# ---- auth -------------------------------------------------------------------


class AuthRequired(CalculatorError):
    code = "AUTH_REQUIRED"


class AuthExpired(AuthRequired):
    code = "AUTH_EXPIRED"

    def __init__(self, message: str = "Session expired or missing.", **kw: Any):
        hint = kw.pop("hint", None) or "Run `autocalc login` to sign in once in a browser window."
        super().__init__(message, hint=hint, **kw)


class AuthLoginFailed(AuthRequired):
    code = "AUTH_LOGIN_FAILED"


class AuthProfileBusy(AuthRequired):
    code = "AUTH_PROFILE_BUSY"

    def __init__(self, message: str = "The browser profile is in use by another process.", **kw: Any):
        hint = kw.pop("hint", None) or (
            "Close the other autocalc window or process using this profile, or pass --profile NAME.")
        super().__init__(message, hint=hint, **kw)


# ---- upstream / transport ---------------------------------------------------


class UpstreamError(CalculatorError):
    code = "UPSTREAM"


class UnexpectedResponse(CalculatorError):
    code = "UNEXPECTED_RESPONSE"


# ---- Huawei business exception ids -> typed errors --------------------------

# CBC.0101 user invalid / not logged in, CBC.0102 bad share key, CBC.6001 missing param,
# CBC.6006 spec not found / not sold, CBC.6008 product not exist.
_EXCEPTION_MAP: dict[str, type[CalculatorError]] = {
    "CBC.0101": AuthExpired,
    "CBC.0102": SpecNotFound,
    "CBC.6001": ValidationError,
    "CBC.6006": SpecNotFound,
    "CBC.6008": SpecNotFound,
}


def raise_for_exception(data: dict[str, Any]) -> None:
    """Raise a typed error for a Huawei business exception payload (if any)."""
    exc = data.get("exceptionId") or data.get("error_code")
    if not exc or exc in ("CBC.0000", "200"):
        return
    desc = data.get("descArgs") or data.get("exceptionDesc") or data.get("error_msg") or exc
    if isinstance(desc, (list, tuple)):
        desc = ", ".join(map(str, desc))
    cls = _EXCEPTION_MAP.get(str(exc), UpstreamError)
    hint = None
    if cls is AuthExpired:
        hint = "Run `autocalc login` to sign in once in a browser window."
    elif cls is SpecNotFound:
        hint = "Run search_skus for this service/region to find a valid spec."
    raise cls(str(desc), code=str(exc), hint=hint, details={"exceptionId": exc})
