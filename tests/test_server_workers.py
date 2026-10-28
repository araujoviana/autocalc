"""MCP tools execute blocking work outside the event loop, one at a time."""

import asyncio
import threading
import time

from autocalc import server


def test_mcp_workers_serialize_blocking_calls(monkeypatch):
    monkeypatch.setattr(server, "with_notice", lambda value: value)
    active = 0
    maximum = 0
    lock = threading.Lock()

    def operation():
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
        try:
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                pass
            else:
                raise AssertionError("tool is running on an event loop")
            time.sleep(0.05)
        finally:
            with lock:
                active -= 1
        return "ok"

    async def exercise():
        wrappers = [server._tool_errors(operation) for _ in range(3)]
        return await asyncio.gather(*(wrapped() for wrapped in wrappers))

    assert asyncio.run(exercise()) == ["ok"] * 3
    assert maximum == 1
