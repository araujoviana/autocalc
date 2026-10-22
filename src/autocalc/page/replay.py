"""Any service on the calculator page: a builder card's form state -> steps -> the page's own card.

The builder says *what* to fill (its ``rewriteValue`` is the form state it intends); the page
builds the card. The two are compared afterwards, so a form state the page cannot reproduce
fails instead of shipping the builder's card.
"""

from __future__ import annotations

import re
from typing import Any

from autocalc.errors import PageEncodeFailed
from autocalc.page.driver import Step

ADDIBLE = "_|addible0|_"
ROW = re.compile(r".*_\|addible0\|_\d+")
GLOBAL_STEPPER = {"global_ONDEMANDTIME": "global_ONDEMANDTIME_Stepper_0", "global_QUANTITY": "global_QUANTITY_Stepper_0"}


def _measure(value: Any) -> Any:
    return value["measureValue"] if isinstance(value, dict) and "measureValue" in value else value


def _leaves(prefix: str, value: Any, steps: list[Step], added: set[str]) -> None:
    """Flatten one form-state entry. A nested key that starts with its parent's id is a full id."""
    if isinstance(value, dict) and "measureValue" not in value:
        for key, sub in value.items():
            child = key if key.startswith(prefix) else f"{prefix}_{key}"
            if ROW.fullmatch(child) and child not in added:  # one add click per addible row
                added.add(child)
                steps.append(Step(child.split(ADDIBLE)[0], "add"))
            _leaves(child, sub, steps, added)
        return
    steps.append(Step(prefix.replace("_UNSET_Stepper", "_Stepper"), "auto", _measure(value)))


def same_value(a: Any, b: Any) -> bool:
    """Equal as the form means it: a text input keeps ``'6'`` where the builder wrote ``6.0``."""
    try:
        return float(a) == float(b)
    except (TypeError, ValueError):
        return a == b


def form_values(template_render: dict[str, Any]) -> dict[str, Any]:
    """The form state as ``{control id: value}``, flattened the way ``card_steps`` addresses controls."""
    steps: list[Step] = []
    for group, value in template_render.items():
        _leaves(group, value, steps, set())
    return {s.component_id: s.value for s in steps if s.kind == "auto"}


def global_values(form_state: dict[str, Any]) -> dict[str, Any]:
    """The values of the global steppers the page keeps outside ``template_RENDER``."""
    return {sid: _measure((form_state.get(group) or {}).get("UNSET_Stepper_0")) for group, sid in GLOBAL_STEPPER.items()}


def card_steps(rewrite_value: dict[str, Any]) -> list[Step]:
    """The steps that fill the form with a ``rewriteValue``'s state, globals first."""
    region = rewrite_value["global_REGIONINFO"]
    steps = [Step("global_REGIONINFO_region", "region", region["region"])] if region.get("region") else []  # global pages have none
    if region.get("chargeMode"):
        steps.append(Step("global_REGIONINFO_chargeMode", "radio", region["chargeMode"]))
    if period := rewrite_value.get("global_PERIODTIME", {}).get("UNSET_PeriodTime"):
        steps.append(Step("global_PERIODTIME_UNSET_PeriodTime", "radio", f"{period['measureValue']}_{period['measureId']}"))
    if hours := rewrite_value.get("global_ONDEMANDTIME"):
        steps.append(Step(GLOBAL_STEPPER["global_ONDEMANDTIME"], "auto", _measure(hours["UNSET_Stepper_0"])))
    added: set[str] = set()
    for group, value in rewrite_value["template_RENDER"].items():
        _leaves(group, value, steps, added)
    if qty := rewrite_value.get("global_QUANTITY"):
        steps.append(Step(GLOBAL_STEPPER["global_QUANTITY"], "auto", _measure(qty["UNSET_Stepper_0"])))
    return steps


# Where the page's on-demand form uses other control ids than the saved cards of the same service
# (observed on SFS Turbo: the "Demand" controls replace the "Period" ones in on-demand billing).
ALIASES = {("sfsturbo", "ONDEMAND"): {"calculator_sfsType_radio": "calculator_sfsDemand_radio",
                                      "calculator_sfsPeriod_36input": "calculator_sfsDemand_36input"}}


# builder key -> the calculator's own service key, where they differ in case
PAGE_SERVICE = {"rabbitmq": "rabbitMQ"}


def for_page(service: str, rewrite_value: dict[str, Any]) -> dict[str, Any]:
    """The form state with the control ids this billing mode's form uses."""
    rename = ALIASES.get((service, rewrite_value["global_REGIONINFO"].get("chargeMode")), {})
    render = {rename.get(group, group): value for group, value in rewrite_value["template_RENDER"].items()}
    return {**rewrite_value, "template_RENDER": render}


def encode_card(service: str, rewrite_value: dict[str, Any]) -> dict[str, Any]:
    """The card the page builds for this form state, anonymously, in a fresh browser context."""
    rewrite_value = for_page(service, rewrite_value)
    from autocalc.page.browser import page_context
    from autocalc.page.driver import Driver

    with page_context(service) as ctx:
        driver = Driver(ctx.new_page(), PAGE_SERVICE.get(service, service))
        driver.open()
        driver.run(card_steps(rewrite_value))
        card = driver.capture()
    asked = form_values(rewrite_value["template_RENDER"])
    got = form_values(card["rewriteValue"]["template_RENDER"])
    if (lost := {k: (v, got.get(k)) for k, v in asked.items() if not same_value(got.get(k), v)}):
        raise PageEncodeFailed("The page's card does not hold the requested form state.", service=service,
                               step="form", field=sorted(lost)[0], frontend_version=driver.frontend_version)
    return card
