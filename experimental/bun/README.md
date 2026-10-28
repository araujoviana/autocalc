# Experimental Bun calculator

This is an in-progress TypeScript migration kept alongside the Python application at the repository root. It is based on an earlier Python revision and does not yet have parity with current `main`, including the draft/revise/publish workflow and page-encoder publication gate. Do not replace or remove the Python implementation until the migration has been reconciled and its acceptance checks pass.

The OBS audit fixes are included. The vendor calculator's OBS Edit behavior remains unresolved; a live Edit round-trip has not been verified. Review saved OBS configurations before and after editing them.

Run from this directory with Bun 1.4.4:

```sh
bun install --frozen-lockfile
bun run check
bun run check:boundaries
bun run test:offline
bun run src/cli.ts --help
```

The MCP entry point is `src/mcp.ts`. Keep session files, private corpus fixtures, and customer quotation data outside version control.
