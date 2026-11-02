"""The committed schemas still describe the live calculator page (anonymous, read-only)."""

import pytest

from autocalc.schema import generate

pytestmark = pytest.mark.live


@pytest.mark.parametrize("service", ["ecs", "redis", "nat"])
def test_committed_schema_matches_the_live_page(service):
    drift = generate.diff(generate.load_service(service), generate.pull(service))
    assert not any(drift.values()), f"{service} drifted: {drift}. Run `autocalc schema diff {service}`."
