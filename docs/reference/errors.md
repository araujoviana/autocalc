# Error codes

Every failure returned to an agent is a structured payload: `error` (the code), `message`,
and, when known, `hint` (what to do) and `details`. Codes come from `src/autocalc/errors.py`.

| Code | Class | Meaning | Typical hint |
|---|---|---|---|
| `AUTOCALC` | `CalculatorError` | Base class; an unclassified failure | — |
| `VALIDATION` | `ValidationError` | Invalid input; `details.field` and `details.allowed` name the valid values | "Valid <field>: …" |
| `SPEC_NOT_FOUND` | `SpecNotFound` | The SKU/spec is not sold in that region | the closest specs, or "run search_skus" |
| `SERVICE_NOT_SOLD` | `ServiceNotSold` | The service is not sold in that region | regions where it is sold |
| `MODE_NOT_OFFERED` | `ModeNotOffered` | The billing mode is not offered there | the offered modes |
| `REGION_NOT_FOUND` | `RegionNotFound` | No region matches the name | an example of a valid value |
| `REGION_AMBIGUOUS` | `RegionAmbiguous` | Several regions match; `details.choices` lists them | "Pick one of: …" |
| `AUTH_REQUIRED` | `AuthRequired` | The call needs a logged-in session | `autocalc login` |
| `AUTH_EXPIRED` | `AuthExpired` | The session is missing or expired, and silent refresh failed | `autocalc login` |
| `AUTH_LOGIN_FAILED` | `AuthLoginFailed` | The login window could not complete | — |
| `UPSTREAM` | `UpstreamError` | The calculator backend failed (after retries for 5xx and timeouts) | retry; `autocalc doctor` |
| `UNEXPECTED_RESPONSE` | `UnexpectedResponse` | The backend answered in an unrecognized shape (possible frontend drift) | `autocalc doctor` |

## Huawei business exceptions

| `exceptionId` | Raised as |
|---|---|
| `CBC.0101` | `AuthExpired` |
| `CBC.0102`, `CBC.6006`, `CBC.6008` | `SpecNotFound` |
| `CBC.6001` | `ValidationError` |
| anything else | `UpstreamError` |

!!! warning "Known discrepancy"
    For these mapped exceptions the payload's `error` field currently carries the Huawei id
    (for example `CBC.6006`) instead of the class code (`SPEC_NOT_FOUND`) that the
    `huawei/rating` spec requires. The id is also in `details.exceptionId`. Agents should
    match on both until this is fixed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `AUTH_EXPIRED` | `autocalc login` (a silent refresh was already tried) |
| `SERVICE_NOT_SOLD` / `SPEC_NOT_FOUND` | the hint lists valid regions or the closest specs; use `search` or `describe_service` |
| `REGION_AMBIGUOUS` | pick one of the listed region ids |
| rating fails with 5xx or a timeout | it was retried with backoff; run `autocalc doctor` if it persists |
| the login browser does not open | install Chrome, Edge or Chromium, or set `AUTOCALC_BROWSER`; `autocalc install-browser` installs Playwright's build. On WSL, check WSLg (`echo $DISPLAY`) |

Which services autocalc can build cards for, and in which modes, is returned live by the
`supported_services` MCP tool.
