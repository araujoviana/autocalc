"""ECS cards must not carry an EIP unless the caller asks for one (docs/explanation/huawei/card-rules.md).

A default 5 Mbit/s EIP silently added ~USD 3.69/month to every ECS card built through
`publish_quote`, including RI cards (build(billing="ri") forwards its defaults).
"""

from __future__ import annotations

import inspect

import pytest

from autocalc.services.ecs import EcsBuilder

BW_TYPES = ("hws.resource.type.bandwidth", "hws.resource.type.eip")


@pytest.mark.parametrize("method", ["build", "build_ri"])
def test_no_default_bandwidth(method):
    assert inspect.signature(getattr(EcsBuilder, method)).parameters["bandwidth_mbit"].default is None


@pytest.mark.live
@pytest.mark.parametrize("billing", ["monthly", "ri"])
def test_card_without_bandwidth_has_no_eip(billing):
    card = EcsBuilder().build(region="sa-brazil-1", flavor="c7n.large.2", billing=billing)
    types = [p.get("resourceType") for p in card["selectedProduct"]["productAllInfos"]]
    assert not any(t in BW_TYPES for t in types)
