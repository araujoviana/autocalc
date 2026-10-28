"""SFS Turbo capacity must address the form control for the selected tier."""

import pytest

from autocalc.page.replay import for_page
from autocalc.services.sfs import SfsTurboBuilder


@pytest.mark.parametrize(("tier", "control"), [("20MBps", "calculator_sfsPeriod_36input"),
                                           ("40MBps", "calculator_sfsPeriod_12input")])
def test_capacity_control_matches_tier(tier, control, monkeypatch):
    builder = SfsTurboBuilder(object())
    monkeypatch.setattr(builder, "catalog", lambda *_: {})
    monkeypatch.setattr(builder, "product", lambda *args: {})
    monkeypatch.setattr(builder, "assemble", lambda *args, **kwargs: args[7])
    render = builder.build("region", tier=tier, size_gb=1024)
    assert render[control] == 1


def test_on_demand_alias_covers_high_throughput_capacity():
    rewrite = {"global_REGIONINFO": {"chargeMode": "ONDEMAND"},
               "template_RENDER": {"calculator_sfsPeriod_12input": 1}}
    assert for_page("sfsturbo", rewrite)["template_RENDER"] == {"calculator_sfsDemand_12input": 1}
