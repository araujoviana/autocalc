# Error codes

Every failure returned to an agent is a structured payload: `error` (the code), `message`,
and, when known, `hint` (what to do) and `details`. Codes come from `src/core/errors.ts`.

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
| `AUTH_LOGIN_FAILED` | `AuthLoginFailed` | The login window could not complete, or the browser could not start | `autocalc login` again; install Chrome or Edge, or set `AUTOCALC_BROWSER` |
| `AUTH_PROFILE_BUSY` | `AuthProfileBusy` | Another process (a login window, another autocalc) has the browser profile open | close it, or pass `--profile NAME` |
| `PAGE_ENCODE_FAILED` | `PageEncodeFailed` | The calculator page did not produce a card: a field could not be set, a value is not offered, the price inquiry failed, or the card did not appear in time. `details` names the `service` and the `field` or `step`, plus the page's `frontend_version` | re-run with `AUTOCALC_PAGE_HEADED=1` to watch the page |
| `UPDATE_FAILED` | `UpdateFailed` | `autocalc update` found no release tag, was given something that is not `vX.Y.Z`, or `bun` failed to reinstall | check network and git access to the repository; on Windows run the installer again |
| `GATE_FAILED` | `GateFailed` | A saved list did not pass the publish gate, or the gate could not run, so no link was returned. `details.cards` has the stored, rated and Edit amounts and the reasons per card; `details.list_id` is set only when the list still exists | fix the card named in `details.cards`, or see [Publish gate](../explanation/huawei/publish-gate.md) |
| `UPSTREAM` | `UpstreamError` | The calculator backend failed (after retries for 5xx and timeouts) | retry; `autocalc doctor` |
| `UNEXPECTED_RESPONSE` | `UnexpectedResponse` | The backend answered in an unrecognized shape (possible frontend drift) | `autocalc doctor` |

## Writing errors

One rule, so every error reads the same and a change is one edit.

| Field | Rule |
|---|---|
| `message` | What failed, as one sentence about the subject: "Image 'AlmaLinux' matches several catalog images." No advice, no JSON, no stack text. |
| `hint` | What to do next, as an imperative sentence: "Choose an exact name." Omit it when there is nothing useful to say. |
| `details` | Machine-readable fields (`field`, `allowed`, `cards`, `list_id`). Never prose; the terminal prints them as `key: value` lines. |

`CalculatorError` enforces the sentence form itself (`sentence()` in `src/core/errors.ts`): a capital
first letter and a final period. A multi-line message keeps its own layout. Write the text as a
sentence anyway; do not rely on the class to fix it. Code and tests match on `code` and `details`,
not on message wording. To change how errors look in a terminal, edit `formatError` in
`src/core/ui.ts`; `--json` and MCP output are not affected by it.

## Huawei business exceptions

| `exceptionId` | Raised as | Code |
|---|---|---|
| `CBC.0101` | `AuthExpired` | `AUTH_EXPIRED` |
| `CBC.0102`, `CBC.6006`, `CBC.6008` | `SpecNotFound` | `SPEC_NOT_FOUND` |
| `CBC.6001` | `ValidationError` | `VALIDATION` |
| `CBC.6050` | `UpstreamError` | `UPSTREAM` |
| anything else | `UpstreamError` | `UPSTREAM` |

All mapped upstream exceptions return normalized error codes in the payload's `error` field (`SPEC_NOT_FOUND`, `AUTH_EXPIRED`, etc.) via `CalculatorError.toJSON()`. The original Huawei error code is always retained under `details.exceptionId`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `AUTH_EXPIRED` | `autocalc login` (a silent refresh was already tried) |
| `AUTH_PROFILE_BUSY` | close the open login window or the other autocalc process; an MCP server only holds the profile for the few seconds it takes to read it |
| `PAGE_ENCODE_FAILED` | a `field` usually means the value isn't offered for that region or flavor; a `step` of `inquiry` means the page's own price check failed. If the `frontend_version` changed, the page may have been redesigned ([Page encoder](../explanation/huawei/page-encoder.md)) |
| `GATE_FAILED` | the list was deleted; each entry in `details.cards` says what differed (rating, Edit view, or validation). If `details.list_id` is present the list is still on your account: delete it by hand |
| `SERVICE_NOT_SOLD` / `SPEC_NOT_FOUND` | the hint lists valid regions or the closest specs; use `search` or `describe_service` |
| `REGION_AMBIGUOUS` | pick one of the listed region ids |
| rating fails with 5xx or a timeout | it was retried with backoff; run `autocalc doctor` if it persists |
| the login browser does not open | install Chrome, Edge or Chromium, or set `AUTOCALC_BROWSER`; `autocalc install-browser` installs Playwright's build. On WSL, check WSLg (`echo $DISPLAY`) |

Which services autocalc can build cards for, and in which modes, is returned live by the
`supported_services` MCP tool.
