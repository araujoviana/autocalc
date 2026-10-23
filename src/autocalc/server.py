"""MCP server for the Huawei Cloud pricing calculator: registers every tool in the registry.

Read tools (catalog, rating, currency, anonymous share/detail) need no credentials.
Write tools (publish/update/delete a saved list) use the one-time browser session
(``autocalc login``); they return AUTH_EXPIRED with a fix hint when it is missing.
"""

from __future__ import annotations

import asyncio
import functools

from mcp.server.fastmcp import FastMCP

from autocalc import workflow  # noqa: F401  (registers the workflow tools)
from autocalc.errors import CalculatorError
from autocalc.tools import REGISTRY
from autocalc.update import with_notice

mcp = FastMCP("hwc-calculator")


def _tool_errors(fn):
    """Wrap a tool so CalculatorError becomes a structured {"error","hint"} payload."""
    @functools.wraps(fn)
    async def wrapper(*a, **k):
        try:  # a worker thread: the tools block, and Playwright's sync API refuses to run inside the event loop
            return await asyncio.to_thread(lambda: with_notice(fn(*a, **k)))
        except CalculatorError as exc:
            return exc.as_dict()
    return wrapper


for _fn in REGISTRY.values():
    mcp.tool()(_tool_errors(_fn))


# ---- prompt -----------------------------------------------------------------


@mcp.prompt()
def quote_workflow() -> str:
    """Standard workflow for turning a request into a shareable Huawei Cloud quote (C5)."""
    return (
        "1. Collect requirements: services, region (friendly names ok), billing mode(s), quantities and sizes.\n"
        "2. Call draft_quote(customer, requirements); exact matches are confirmed automatically.\n"
        "3. Show the candidates of every pending requirement, let the user choose, call revise_quote.\n"
        "4. Show the chosen specs and prices; when the user agrees, call publish_quote and reply with the share link and a table.\n"
        "5. Units: sizes in GB, bandwidth in Mbit/s, 730 h = one month. Use compare_modes for PPU/monthly/yearly."
    )


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
