# autocalc Comprehensive Audit & Migration Review
**Date**: 2026-11-02  
**Branch**: `ts-parity`  
**Status**: Untracked Research / Audit Document  
**Scope**: Security, Architecture & Migration Design, UI/UX Ergonomics, and MCP Design Quality  

---

## Executive Summary

This review provides a comprehensive, grounded evaluation of the `autocalc` repository during its transition from Python (`src/autocalc/`) to TypeScript on Bun (`experimental/bun/`). The review examines the current canonical Python implementation, the in-progress TypeScript migration tree, the OpenSpec specifications (`openspec/specs/`), Architecture Decision Records (`docs/adr/`), and active research documents (`docs/research/edit-verification.md`).

### High-Level Verdict
- **Core Abstraction**: The provider-neutral quote state machine (ADR-0005, 0006, 0009, 0010, 0015) has been ported to TypeScript with high fidelity (`core/quote/`), maintaining clean hexagonal architecture separation between core quotation logic and cloud providers.
- **Critical Security Risks**: 
  1. A command/newline injection risk in TypeScript's macOS credential backend (`session-store.ts`).
  2. A regression against ADR-0011 in TypeScript where the OS keychain and `.session.curl` file parsing were reintroduced.
  3. A Windows path traversal loophole in the Python MCP schema resource handler (`server.py`).
- **Migration & Parity Status**: Significant parity deficit remains: **21 of 44 Python test files are missing** in TypeScript, 9 workflow/schema tools are unported, 1 obsolete tool (`create_price_list`) is improperly exposed in TypeScript, and tool argument contracts drift between implementations.
- **UI/UX Degradation**: The TypeScript CLI has regressed to unconditionally printing raw multiline JSON for all commands, completely abandoning the human-readable ASCII tables, ANSI color styling, `NO_COLOR` standard compliance, and encoding-safe status glyphs implemented in Python's `ui.py`.
- **MCP Quality Deficit**: TypeScript's `mcp.ts` contains an SDK overwrite bug that bypasses high-level tool dispatch and Zod validation, registers zero schema resources, and serves a stale workflow prompt instructing AI agents to invoke the deprecated `create_price_list` tool.

---

## 1. Security & Credential Management

### 1.1 Insecure Command Construction in macOS Credential Store (High)
* **Location**: [`experimental/bun/src/core/session-store.ts#L20-L27`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/session-store.ts#L20-L27)
* **Grounded Standards**: 
  - [CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')](https://cwe.mitre.org/data/definitions/78.html)
  - [OWASP ASVS v4.0 §V5.3: Output Encoding and Injection Defense Requirements](https://owasp.org/www-project-application-security-verification-standard/)
* **Vulnerability Analysis**:
  In `experimental/bun/src/core/session-store.ts`, the macOS keychain integration constructs an interactive command stream passed to `security -i`:
  ```typescript
  const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return {
    async set(key, value) { 
      return (await run(["-i"], `add-generic-password -U -s autocalc -a ${quote(key)} -w ${quote(value)}\n`)).status === 0; 
    },
    // ...
  };
  ```
  `quote()` only escapes backslashes and double quotes. Because `security -i` reads line-delimited commands from stdin, any newline character (`\r` or `\n`) in `key` or `value` terminates the `add-generic-password` command prematurely. Any text following the newline is interpreted as an arbitrary subsequent subcommand by the `security` CLI under the calling user's terminal privileges.
* **Remediation**:
  Avoid passing commands through interactive text shells (`-i`). If invoking `security`, pass arguments as discrete array tokens in `Bun.spawn(["security", "add-generic-password", "-U", "-s", "autocalc", "-a", key, "-w", value])` without shell wrapping, or reject/strip any CR/LF characters prior to invocation. (Better yet: remove the keychain layer entirely in accordance with ADR-0011).

---

### 1.2 Divergence from ADR-0011 & Keyring/cURL Reintroduction (High)
* **Location**:
  - [`experimental/bun/src/core/auth.ts#L13`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/auth.ts#L13) (`legacySessionFile`)
  - [`experimental/bun/src/core/auth.ts#L31-L71`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/auth.ts#L31-L71) (`parseCurl`, `migrateLegacySession`)
  - [`experimental/bun/src/core/session-store.ts#L10-L33`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/session-store.ts#L10-L33) (`systemCredentialBackend`)
  - Contrast with [`docs/adr/0011-auth-browser-profile-is-the-credential.md#L28-L51`](file:///home/tideman/Projetos/python-projs/autocalc/docs/adr/0011-auth-browser-profile-is-the-credential.md#L28-L51)
  - Contrast with [`openspec/changes/ts-parity/design.md#L50-L54`](file:///home/tideman/Projetos/python-projs/autocalc/openspec/changes/ts-parity/design.md#L50-L54) (Decision D4)
* **Grounded Standards**:
  - [CWE-522: Insufficiently Protected Credentials](https://cwe.mitre.org/data/definitions/522.html)
  - [CWE-312: Cleartext Storage of Sensitive Information](https://cwe.mitre.org/data/definitions/312.html)
  - [OWASP ASVS v4.0 §V3: Session Management Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
* **Vulnerability Analysis**:
  ADR-0011 established that Huawei Cloud session cookies grant broad tenant access, and that multiple credential storage layers create state synchronization bugs and secret leakage. ADR-0011 explicitly decided:
  > *"The cookie export, keyring and cURL-import layers are removed... The profile directory is still the only credential store, logout still deletes it whole, and there is still no keyring copy."*
  
  In Python, credentials live solely inside the browser profile directory in `autocalc-session` ([`src/autocalc/auth.py#L53`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/auth.py#L53)) with mode 0600.
  
  In TypeScript:
  1. It reads and parses relative files (`../../.session.curl` via `import.meta.url`).
  2. It attempts to store cookies in the OS keyring via `secret-tool` (Linux) and `security` (macOS).
  3. It saves to `session.json` in the configuration directory rather than `autocalc-session` inside `browser-profile`. This directly violates Decision D4 of the parity plan: *"Keep on-disk formats readable by both implementations so users keep their session and open drafts across cutover."*
* **Remediation**:
  Delete `parseCurl`, `migrateLegacySession`, `systemCredentialBackend`, and `legacySessionFile`. Port Python's `_save_session`, `_load_session`, and `_forget_session` so that TypeScript reads and writes `{ "cookie": string, "account_mask": string | null }` directly to `<profileDir>/autocalc-session`.

---

### 1.3 Windows Path Traversal in MCP Schema Resource Endpoint (Medium)
* **Location**: [`src/autocalc/server.py#L70-L76`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/server.py#L70-L76)
* **Grounded Standards**:
  - [CWE-22: Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')](https://cwe.mitre.org/data/definitions/22.html)
  - [OWASP Top 10: A01:2021-Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
* **Vulnerability Analysis**:
  In `server.py`:
  ```python
  @mcp.resource("autocalc://schema/{service}", mime_type="application/yaml")
  def schema_of(service: str) -> str:
      from autocalc.schema import generate
      if "/" in service or not (generate.FILES / f"{service}.yaml").exists():
          raise ValueError(f"No schema for {service!r}...")
      return (generate.FILES / f"{service}.yaml").read_text(encoding="utf-8")
  ```
  The validation assumes Unix path conventions by checking `if "/" in service`. On Windows platforms, `\` is the native path separator. A resource request passing `service="..\\..\\some_file"` contains no `/` character and can traverse outside `generate.FILES`.
* **Remediation**:
  Use strict alphanumeric/whitelist validation:
  ```python
  import re
  if not re.fullmatch(r"[\w-]+", service) or not (generate.FILES / f"{service}.yaml").is_file():
      raise ValueError(f"No schema for {service!r}")
  ```

---

### 1.4 Windows NTFS ACL Inheritance on Session Secret (Medium)
* **Location**: [`src/autocalc/auth.py#L309-L314`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/auth.py#L309-L314)
* **Grounded Standards**:
  - [CWE-732: Incorrect Permission Assignment for Critical Resource](https://cwe.mitre.org/data/definitions/732.html)
  - [NIST SP 800-63B: Digital Identity Guidelines - Authentication and Lifecycle Management](https://pages.nist.gov/800-63-3/sp800-63b.html)
* **Vulnerability Analysis**:
  `_save_session()` opens `autocalc-session` with mode `0o600` and executes `os.fchmod(fd, 0o600)` only when `os.name != "nt"`. On Windows, numeric POSIX file modes in `os.open` are ignored for access control; the created file inherits the Discretionary Access Control List (DACL) of `%LOCALAPPDATA%` or the parent directory. In non-standard environments, shared workstations, or Windows Server setups, this can permit read access by other local users.
* **Remediation**:
  On Windows, explicitly verify that parent directory permissions are restricted to `CURRENT_USER` and `SYSTEM`, or invoke PowerShell/Win32 ACL APIs to strip inherited read permissions for unprivileged groups.

---

### 1.5 Secure Playwright Execution Flags (Positive Finding)
* **Location**: [`src/autocalc/auth.py#L49`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/auth.py#L49), [`experimental/bun/src/core/browser.ts#L65`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/browser.ts#L65)
* **Grounded Standards**: Playwright Security Hardening Best Practices.
* **Verification**:
  Browser automation strictly limits browser arguments to:
  `["--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage"]`
  Neither `--no-sandbox` nor `--disable-web-security` is present in any project code.

---

## 2. Architectural & Code Design (Migration Parity)

### 2.1 Parity Audit: Gaps Between Python and TypeScript

#### Tool Inventory Comparison (from `parity-registry.py`)
```
Total Tools Canonical in Python: 26
Total Tools Ported in TypeScript: 17

[MISSING IN TYPESCRIPT] (9 tools):
  - apply_quote            (Declarative quote application via publish gate)
  - draft_quote            (Step 1 of draft->revise->publish workflow)
  - export_quotes_xlsx     (Fixed 4-sheet quote workbook exporter)
  - inspect_draft          (State inspector for in-flight/ambiguous publications)
  - list_drafts            (Local draft enumerator)
  - plan_quote             (Offline quote validation & ranking against schemas)
  - publish_quote          (Step 3 of workflow; fail-closed gate publisher)
  - recover_draft          (Recovery reset for interrupted publications)
  - revise_quote           (Step 2 of workflow; human decision recorder)

[UNEXPECTED IN TYPESCRIPT] (1 tool):
  - create_price_list      (Deprecated imperative publisher; violates ADR-0016)
```

#### Argument-Level Schema Drift in Common Tools
1. **`compare_regions`**:
   - Python: requires argument `billing` ([`tools.py#L133`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/tools.py#L133)).
   - TypeScript: requires argument `mode` ([`schemas.ts#L112`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/schemas.ts#L112)).
   - *Spec Violation*: OpenSpec `mcp-surface` states: *"Every tool that takes a billing mode SHALL call the argument billing"*.
2. **`list_regions`**:
   - Python: accepts optional argument `service` ([`tools.py#L49`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/tools.py#L49)).
   - TypeScript: accepts extra argument `region` ([`schemas.ts#L105`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/schemas.ts#L105)).
   - *Spec Violation*: OpenSpec `mcp-surface` states: *"list_regions SHALL take only an optional service and return region ids with display names"*.
3. **`auth_login`**:
   - Python: accepts `wait_seconds` ([`tools.py#L391`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/tools.py#L391)).
   - TypeScript: accepts `timeout` ([`schemas.ts#L125`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/schemas.ts#L125)).
4. **`compare_modes`**:
   - Python: supports `hours` and `periods` ([`tools.py#L145`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/tools.py#L145)).
   - TypeScript: does not support `hours` or `periods`.

---

### 2.2 Test Suite Parity Map (from `parity-test-map.py`)
Only **23 out of 44** Python test files have TypeScript counterparts (52% coverage). 21 test files are completely missing in TypeScript:

| Missing Python Test Suite | Target Migration Phase / Task | Description & Functional Risk |
| :--- | :---: | :--- |
| `test_workflow` | Task 3.1 | Core draft/revise/publish lifecycle and state transitions |
| `test_forms` | Task 4.1 | Form-only builder replay against fixtures |
| `test_form_only` | Task 4.1 | Request fidelity verification (ADR-0016) |
| `test_page` | Task 4.1 | Browser context options and page session isolation |
| `test_page_replay` | Task 4.1 | Control state decoding and input dispatch |
| `test_audit_page_comparison` | Task 4.1 | Stored state vs rendered calculator page comparison |
| `test_audit_service_safety` | Task 4.1 | Input boundary checking and quantity rejection |
| `test_public_form_fixtures` | Task 4.1 | Static fixture validation across all 50 services |
| `test_gate` | Task 4.2 | Fail-closed publish gate: rerate, edit check, auto-delete on mismatch |
| `test_share_session` | Task 4.2 | Authenticated write operations and session refresh |
| `test_schema` | Task 4.3b | Declarative schema loader and YAML validator |
| `test_schema_invariants` | Task 4.3b | Service schema structural rules |
| `test_quote_file` | Task 4.3b | `plan_quote` and `apply_quote` execution |
| `test_region_sweep` | Task 4.4 | 4-region live verification sweep (`sa-brazil-1`, `la-south-2`, etc.) |
| `test_frontend` | Task 5.2 | Frontend version drift detection against Huawei CDN |
| `test_update` | Task 5.2 | Daily update checker and updater |
| `test_ui` | Task 5.3 | CLI terminal presentation, ASCII tables, and status glyphs |
| `test_live` | Live Marker | Live pricing sanity checks (excluded from CI) |
| `test_page_live` | Live Marker | Live calculator automation tests |
| `test_public_form_live` | Live Marker | Live form submission tests |
| `test_schema_live` | Live Marker | Live schema synchronization tests |

---

### 2.3 Hexagonal Provider Architecture (Positive Finding)
* **Location**: 
  - Python: [`src/autocalc/core/provider.py`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/core/provider.py), [`src/autocalc/core/model.py`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/core/model.py)
  - TypeScript: [`experimental/bun/src/core/quote/provider.ts`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/quote/provider.ts), [`experimental/bun/src/core/quote/model.ts`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/quote/model.ts)
* **Grounded Standards**: Alistair Cockburn, *Hexagonal Architecture (Ports and Adapters)*; [ADR-0015](file:///home/tideman/Projetos/python-projs/autocalc/docs/adr/0015-strangler-core-and-aws-second.md).
* **Architecture Evaluation**:
  The core domain model (`Requirement`, `Candidate`, `Decision`, `Draft`, `RunRecord`) is decoupled from vendor specifics. The `Provider` port requires only:
  ```typescript
  export interface Provider {
    readonly name: string;
    candidates(req: Requirement): Promise<Candidate[]>;
  }
  ```
  `HuaweiProvider` adapts Huawei's rating engine and catalog queries to this port. Ranking (`ranking.ts`), draft state management (`draft.ts`), and immutable event run logging (`runs.ts`) remain independent of the pricing provider.

---

### 2.4 Declarative vs. Imperative Schema Layer
* **Location**:
  - Python: Committed declarative YAML schemas in [`src/autocalc/schema/files/*.yaml`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/schema/files)
  - TypeScript: Hardcoded imperative discriminated union in [`experimental/bun/src/core/schemas.ts#L64-L100`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/schemas.ts#L64-L100) (`CardInput`)
* **Grounded Standards**: [ADR-0018: Declarative quotes: a generated card schema, with plan and apply](file:///home/tideman/Projetos/python-projs/autocalc/docs/adr/0018-declarative-quotes-and-generated-card-schema.md).
* **Finding**:
  In Python, ADR-0018 introduced page-extracted, committed YAML card schemas (`schema/files/`) that define controls, option names, ranges, and validation constraints.
  
  In TypeScript, `CardInput` is still hardcoded as a Zod discriminated union of 22 individual builder schemas (`ecs`, `evs`, `cce`, `obs`, etc.) with over 100 lines of manual `.superRefine()` checks. This duplicates page logic in code and cannot consume new service schemas without modifying the TypeScript source. Task 4.3b must be completed to load and validate against the committed YAML schemas directly.

---

### 2.5 Error Model Degradation in TypeScript
* **Location**:
  - Python: [`src/autocalc/errors.py#L12-L195`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/errors.py#L12-L195)
  - TypeScript: [`experimental/bun/src/core/errors.ts#L1-L32`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/core/errors.ts#L1-L32)
* **Finding**:
  Python defines specialized subclasses inheriting from `CalculatorError`:
  - `ValidationError` (populates `field`, `allowed` choices, and auto-generates actionable `hint`).
  - `GateFailed` (carries per-card structured diffs when the publish gate rejects a price mismatch).
  - `SpecNotFound`, `ServiceNotSold`, `ModeNotOffered`, `RegionNotFound`, `AuthExpired`, etc.
  
  TypeScript compresses this into a single class with a union of strings:
  ```typescript
  export type ErrorCode = "AUTOCALC" | "VALIDATION" | "SPEC_NOT_FOUND" | "SERVICE_NOT_SOLD" |
    "MODE_NOT_OFFERED" | "REGION_NOT_FOUND" | "REGION_AMBIGUOUS" | "AUTH_REQUIRED" |
    "AUTH_EXPIRED" | "AUTH_LOGIN_FAILED" | "UPSTREAM" | "UNEXPECTED_RESPONSE" |
    "PAYLOAD_TOO_LARGE" | "PROFILE_BUSY" | "CANCELLED" | "BROWSER_UNAVAILABLE" | "MUTATION_UNKNOWN";
  ```
  Notice: **`GATE_FAILED` is completely missing from `ErrorCode`**. When task 4.2 (porting `gate.py`) is implemented, the error taxonomy will be unable to express gate verification failures without modifying this type.

---

## 3. UI / UX & Terminal Ergonomics

### 3.1 Unconditional Raw JSON Dumping in TypeScript CLI
* **Location**: [`experimental/bun/src/cli.ts#L36`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/cli.ts#L36)
* **Grounded Standards**:
  - [Command Line Interface Guidelines (clig.dev) §Output: "Format for humans by default, machines by request"](https://clig.dev/#output)
  - [Nielsen Norman Group Usability Heuristic #8: Aesthetic and minimalist design](https://www.nngroup.com/articles/ten-usability-heuristics/)
* **Defect Analysis**:
  In `cli.ts`:
  ```typescript
  const print = async (name: string, input: unknown) => 
    process.stdout.write(`${JSON.stringify(await getCore().invoke(name, input), null, 2)}\n`);
  ```
  Every CLI command (`services`, `regions`, `quote`, `describe`, `doctor`, `lists`) unconditionally invokes `print()`, dumping hundreds of lines of raw, unformatted JSON directly to stdout. 
  
  Although line 27 registers `.option("--json", "Print JSON")`, the flag is unused. In contrast, Python's `cli.py` and `ui.py` render clean, aligned ASCII tables (`ui.table()`) with column headers, formatted numbers, and summary counts when invoked from an interactive terminal, reserving JSON for when `--json` is explicitly requested.

---

### 3.2 Regression Against `NO_COLOR` and Character Encoding Standards
* **Location**:
  - Python: [`src/autocalc/ui.py#L8-L50`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/ui.py#L8-L50)
  - TypeScript: Completely missing.
* **Grounded Standards**:
  - [The NO_COLOR Standard (no-color.org)](https://no-color.org/)
  - POSIX Terminal Capabilities & Windows Console Virtual Terminal Sequences
* **Defect Analysis**:
  Python's `ui.py` implements production-grade terminal ergonomics:
  1. Respects `NO_COLOR` and `TERM="dumb"`.
  2. Verifies `stream.isatty()`.
  3. Enables Windows VT console mode (`os.system("")`).
  4. Implements encoding detection via `_can_print()`: if the terminal output encoding cannot represent unicode symbols (`✓`, `⚠`, `✗`), it gracefully falls back to ASCII tags (`[ok]`, `[warn]`, `[FAIL]`), preventing crashes on legacy Windows code pages.
  TypeScript has none of these capabilities.

---

### 3.3 Platform Defect in `autocalc auth import` on POSIX Systems
* **Location**: [`experimental/bun/src/cli.ts#L76-L89`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/cli.ts#L76-L89)
* **Grounded Standards**:
  - [Command Line Interface Guidelines (clig.dev) §Robustness](https://clig.dev/#robustness)
  - [IEEE Std 1003.1 (POSIX Utility Syntax Guidelines)](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html)
* **Defect Analysis**:
  `cli.ts` defines:
  ```typescript
  auth.command("import")
    .argument("[file]")
    .option("--clipboard", "Read the Windows clipboard")
    .action(async (file: string | undefined, options: { clipboard?: boolean }) => {
      // ...
      if (options.clipboard || !file) {
        const executable = Bun.which("powershell.exe");
        if (!executable) throw new CalculatorError("VALIDATION", "Windows PowerShell is unavailable");
        // ...
      } else text = file === "-" ? await Bun.stdin.text() : await readFile(file!, "utf8");
  ```
  If a Linux or macOS user runs `autocalc auth import` without an argument (or pipes via stdin without typing `-`), `!file` evaluates to `true`. The command immediately attempts to spawn `powershell.exe` and crashes with `"Windows PowerShell is unavailable"`.

---

## 4. MCP Design Quality & Agent Ergonomics

### 4.1 SDK Overwrite Bug: Bypassing High-Level MCP Tool Dispatch
* **Location**: [`experimental/bun/src/mcp.ts#L15-L25`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/mcp.ts#L15-L25)
* **Grounded Standards**:
  - [Anthropic Model Context Protocol: Server Architecture](https://modelcontextprotocol.io/docs/concepts/tools)
  - JSON-RPC 2.0 Specification
* **Defect Analysis**:
  In `experimental/bun/src/mcp.ts`, tools are registered via `server.registerTool(...)` at line 16. However, lines 21-25 override the server's low-level request handler:
  ```typescript
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const name = request.params.name;
    if (!Object.hasOwn(registry, name)) throw new McpError(ErrorCode.InvalidParams, `Unknown tool ${name}`);
    return invoke(name, request.params.arguments ?? {}, extra.signal);
  });
  ```
  By calling `server.server.setRequestHandler(CallToolRequestSchema, ...)`, the server **completely overwrites** the handler installed by `McpServer`. Consequently:
  - All handler callbacks provided to `server.registerTool` are dead code and never executed.
  - The SDK's built-in Zod schema validation, argument parsing, and standard error serialization are bypassed.
  - Any future tool features added through the high-level `McpServer` abstraction (e.g. middleware, annotations) will fail to trigger.

---

### 4.2 Stale MCP Workflow Prompt Directing Agents to Obsolete Tools
* **Location**:
  - TypeScript MCP Prompt: [`experimental/bun/src/mcp.ts#L26`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/mcp.ts#L26)
  - Python MCP Prompt: [`src/autocalc/server.py#L82-L93`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/server.py#L82-L93)
* **Grounded Standards**:
  - [OWASP Top 10 for LLMs: LLM06 Excessive Agency](https://genai.owasp.org/llmrisk/llm06-excessive-agency/)
  - [OpenSpec `mcp-surface` (Requirement: Quote workflow prompt)](file:///home/tideman/Projetos/python-projs/autocalc/openspec/specs/mcp-surface/spec.md)
* **Defect Analysis**:
  In TypeScript:
  ```typescript
  server.registerPrompt("quote_workflow", ..., () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: "1. Collect requirements...\n" +
              "2. Call describe_service(service, region)...\n" +
              "3. Call create_price_list(name, items, dry_run=True)...\n" +
              "4. When the user agrees, call create_price_list(dry_run=False)..."
      }
    }]
  }));
  ```
  This prompt instructs agents to use `create_price_list`, which was removed under ADR-0016 because it lacks request fidelity and bypasses the fail-closed publish gate. The canonical prompt in `src/autocalc/server.py` instructs agents to:
  1. Inspect schemas via `autocalc://schema/index` and `autocalc://schema/{service}`.
  2. Use declarative quote planning (`plan_quote`, `apply_quote`) or the step-by-step workflow (`draft_quote` -> `revise_quote` -> `publish_quote`).

---

### 4.3 Total Omission of MCP Resources in TypeScript
* **Location**:
  - Python: [`src/autocalc/server.py#L57-L76`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/server.py#L57-L76)
  - TypeScript: [`experimental/bun/src/mcp.ts`](file:///home/tideman/Projetos/python-projs/autocalc/experimental/bun/src/mcp.ts)
* **Grounded Standards**:
  - [Model Context Protocol Specification: Resources](https://modelcontextprotocol.io/docs/concepts/resources)
  - [ADR-0018: Declarative Quotes and Generated Card Schema](file:///home/tideman/Projetos/python-projs/autocalc/docs/adr/0018-declarative-quotes-and-generated-card-schema.md)
* **Defect Analysis**:
  In Python, the MCP server exposes two critical resources:
  - `autocalc://schema/index`: Summary table of all 50 service schemas, frontend versions, and mapping coverage.
  - `autocalc://schema/{service}`: Full YAML schema providing controls, option names, ranges, and dependencies.
  In TypeScript, `mcp.ts` registers **zero resources**. AI agents connected to the TypeScript MCP server cannot inspect legal option names or ranges, causing them to hallucinate parameters or fail validation.

---

### 4.4 Token Budget & Context Window Economics (Positive Finding)
* **Location**: [`src/autocalc/tools.py#L66-L75`](file:///home/tideman/Projetos/python-projs/autocalc/src/autocalc/tools.py#L66-L75), [`docs/adr/0008-mcp-output-format.md#L43-L48`](file:///home/tideman/Projetos/python-projs/autocalc/docs/adr/0008-mcp-output-format.md#L43-L48)
* **Grounded Standards**: Model Context Protocol Best Practices for Context Window Optimization.
* **Finding**:
  `search_skus` (the largest payload returned by the server) flattens nested API pricing into a single row per SKU containing only `spec`, filtered `description` (stripping noise tokens like `"Remark:"` and `"Spot Duration:"`), and flattened pricing columns (`ondemand`, `monthly`, `yearly`). This reduces token overhead by over 50% (~4,200 tokens down to ~2,100 tokens for 30 ECS rows), preventing agent context bloat.

---

## 5. Prioritized Remediation Playbook

```
Remediation Execution Sequence
┌────────────────────────────────────────────────────────┐
│ Phase 1: Security & Stability Hotfixes (P0 / Immediate)│
│  - Eliminate macOS newline injection in session-store  │
│  - Strip cURL and OS keyring; align session file D4    │
│  - Fix low-level setRequestHandler overwrite in mcp.ts │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: Schema & MCP Alignment (P1 / Pre-Cutover)     │
│  - Register autocalc://schema/* MCP resources in TS    │
│  - Update quote_workflow prompt to draft/publish flow  │
│  - Correct argument drift (compare_regions billing)    │
│  - Add GATE_FAILED to ErrorCode union                  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: Parity Completion (Tasks 3.1 - 4.4)           │
│  - Port workflow tools (draft, revise, publish)        │
│  - Port publish gate (gate.py) and Edit verification   │
│  - Port declarative card schemas (YAML loader & plan)  │
│  - Remove deprecated create_price_list                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: UI/UX & Platform Robustness (P2)              │
│  - Port ui.py to ui.ts (table, colors, NO_COLOR, VT)   │
│  - Honor --json flag: format human tables by default   │
│  - Fix PowerShell clipboard assumption on Linux        │
└────────────────────────────────────────────────────────┘
```

### Phase 1: Security & Immediate Stability (P0)
1. **Fix macOS Command Injection** (`experimental/bun/src/core/session-store.ts`):
   - Replace interactive string interpolation in `security -i` with non-interactive argument arrays, or reject newline characters in input tokens.
2. **Realign Session Storage with ADR-0011 & Decision D4** (`experimental/bun/src/core/session-store.ts` and `auth.ts`):
   - Remove `systemCredentialBackend`, `.session.curl` auto-migration, and `parseCurl`.
   - Store sessions directly in `<profileDir>/autocalc-session` in JSON format `{"cookie": header, "account_mask": mask}` matching Python's schema and path.
3. **Fix MCP Dispatch Overwrite** (`experimental/bun/src/mcp.ts`):
   - Remove `server.server.setRequestHandler(CallToolRequestSchema, ...)` at lines 21-25. Use standard `McpServer.registerTool` handlers to preserve Zod schema validation and error wrapping.

### Phase 2: Schema & MCP Alignment (P1)
1. **Register MCP Schema Resources** (`experimental/bun/src/mcp.ts`):
   - Implement `autocalc://schema/index` and `autocalc://schema/{service}` reading committed YAML schemas from `src/autocalc/schema/files/*.yaml`.
2. **Synchronize Tool Arguments with OpenSpec Contracts** (`experimental/bun/src/core/schemas.ts`):
   - Rename `compare_regions` argument `mode` -> `billing`.
   - Remove extra `region` parameter from `list_regions`.
   - Add `hours` and `periods` to `compare_modes`.
   - Rename `auth_login` parameter `timeout` -> `wait_seconds`.
3. **Update Error Taxonomy** (`experimental/bun/src/core/errors.ts`):
   - Add `"GATE_FAILED"` to the `ErrorCode` type union.

### Phase 3: Functional Parity Completion (Tasks 3.1 - 4.4)
1. **Port Workflow Tools (Task 3.1)**:
   - Expose `draft_quote`, `revise_quote`, `publish_quote`, `list_drafts`, `inspect_draft`, and `recover_draft` in `experimental/bun/src/core/registry.ts` and `cli.ts`.
2. **Port Publish Gate & Form Replay (Tasks 4.1 & 4.2)**:
   - Port `gate.py` (rerate, headless Edit check, auto-delete on mismatch).
   - Integrate the findings from `docs/research/edit-verification.md` (distinguish `load_failed` from `drift`, check after save).
3. **Decommission Deprecated Surface (Task 4.3)**:
   - Remove `create_price_list` from `registry.ts`, `actions.ts`, and `cli.ts`.
4. **Port Declarative Schema Layer (Task 4.3b)**:
   - Implement YAML schema loading, `plan_quote`, and `apply_quote` without hardcoded Zod schemas.

### Phase 4: UI/UX & Terminal Robustness (P2)
1. **Port Terminal Presentation Layer (`ui.ts`)**:
   - Implement table formatting with column alignment and padding.
   - Implement ANSI color helpers with `NO_COLOR` and `TERM="dumb"` support.
   - Implement character encoding checks with unicode/ASCII glyph fallbacks.
2. **Restore Human-Default CLI Output** (`cli.ts`):
   - Check `options.json`: print formatted tables and status glyphs when omitted on a TTY; serialize JSON only when `--json` is supplied or redirected to a pipe.
3. **Correct Platform Assumptions in CLI**:
   - Guard PowerShell clipboard reads behind `process.platform === "win32"`.
   - Support reading from stdin when no file argument is provided on POSIX systems.
