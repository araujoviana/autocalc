"""ECS on the calculator page: options -> recipe steps -> card (design D4).

The options are the ones ``EcsBuilder.build`` takes, and the catalog lookups reuse its helpers,
so the page card and the Python card for the same options can be compared field by field.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from autocalc.client import Billing, Calculator, CalculatorError
from autocalc.errors import ValidationError
from autocalc.page.driver import Step

SERVICE = "ecs"
EVS = "calculator_evs_stepper"
MODES = ("ondemand", "monthly", "yearly", "ri")
CHARGE_MODE = {"ondemand": "ONDEMAND", "monthly": "PERIOD", "yearly": "PERIOD", "ri": "RI"}
VM_FIELDS = ("arch", "vmType", "generation", "cpu", "mem")  # each choice narrows the next
EIP_TYPES = {"19_bgp": "dataInfo_18_"}  # the only EIP type this recipe covers (fixed Mbit/s)


@dataclass(frozen=True)
class EcsTokens:
    """The form tokens for one ECS card, resolved from the region's catalog."""

    vm: dict[str, str]  # VM_FIELDS -> token
    image: tuple[str, str]  # (platform, name)
    disks: list[tuple[str, int]]  # (type token, GB); the first is the system disk


def ecs_steps(region: str, tokens: EcsTokens, billing: Billing = "monthly", *, quantity: int = 1,
              periods: int = 1, hours: float = 730, bandwidth_mbit: int | None = None,
              bandwidth_type: str = "19_bgp", ri_time: str = "1_3",
              payment_type: str = "NO_UPFRONT") -> list[Step]:
    """The steps that fill the ECS form for these options, in the order the form needs them."""
    if billing not in MODES:
        raise ValidationError(f"Unknown billing mode {billing!r}.", field="billing", allowed=list(MODES))
    if bandwidth_type not in EIP_TYPES:
        raise ValidationError(f"The page recipe does not cover bandwidth type {bandwidth_type!r}.",
                              field="bandwidth_type", allowed=list(EIP_TYPES))
    steps = [Step("global_REGIONINFO_region", "region", region),
             Step("global_REGIONINFO_chargeMode", "radio", CHARGE_MODE[billing])]
    if billing == "monthly":
        steps.append(Step("global_PERIODTIME_UNSET_PeriodTime", "radio", f"{periods}_20"))
    elif billing == "yearly":
        steps.append(Step("global_PERIODTIME_UNSET_PeriodTime", "radio", f"{periods}_19"))
    elif billing == "ondemand":
        steps.append(Step("global_ONDEMANDTIME_Stepper_0", "stepper", hours))
    steps += [Step(f"calculator_ecs_radio_{f}", "radio", tokens.vm[f]) for f in VM_FIELDS]
    if billing == "ri":
        steps += [Step("calculator_ecs_RIRadio_RITime", "radio", f"nodeData.{ri_time.split('nodeData.')[-1]}"),
                  Step("calculator_ecs_RIRadio_paymentType", "radio", f"nodeData.{payment_type}")]
    platform, name = tokens.image
    steps += [Step("calculator_ims_select___platform", "select", platform),
              Step("calculator_ims_select_name", "select", name)]
    (sys_type, sys_size), *data = tokens.disks
    steps += [Step(f"{EVS}_main_type", "select", sys_type), Step(f"{EVS}_main_Stepper_0", "stepper", sys_size)]
    for k, (dtype, size) in enumerate(data):
        steps += [Step(EVS, "add"),
                  Step(f"{EVS}_|addible0|_{k}_type", "select", dtype),
                  Step(f"{EVS}_|addible0|_{k}_Stepper_0", "stepper", size)]
    if bandwidth_mbit is None:
        steps.append(Step("calculator_eip_switch_UNSET_Switch", "radio", "calc_15_"))
    else:
        steps += [Step("calculator_eip_switch_UNSET_Switch", "radio", "calc_14_"),
                  Step("calculator_eip_radio_eipSpec", "radio", "dataInfo_14_"),
                  Step("calculator_eip_radio_shareType", "radio", "dataInfo_16_"),
                  Step("calculator_eip_radio_eipType", "radio", EIP_TYPES[bandwidth_type]),
                  Step("calculator_eip_radio_Stepper_1", "stepper", bandwidth_mbit)]
    steps.append(Step("global_QUANTITY_Stepper_0", "stepper", quantity))
    return steps


def resolve_tokens(calc: Calculator, region: str, flavor: str, image: str = "AlmaLinux",
                   system_disk: tuple = ("GPSSD", 40), data_disks: list | None = None) -> EcsTokens:
    """Look the tokens up in the region's catalog, choosing the image exactly as ``EcsBuilder`` does."""
    from autocalc.services.ecs import EcsBuilder

    b = EcsBuilder(calc)
    spec = flavor if flavor.endswith((".linux", ".win")) else f"{flavor}.linux"
    vm = b.catalog(region, "ec2_vm", spec)
    imgs = b.images(region, vm["spec"], image) or b.images(region, None, image)
    if not imgs:
        raise CalculatorError(f"no image matching {image!r} in {region}")
    disks = [(b.catalog(region, "ebs_volume", dtype)["type"], int(size))
             for dtype, size in [system_disk, *(data_disks or [])]]
    return EcsTokens({f: vm[f] for f in VM_FIELDS}, (imgs[0]["platform"], imgs[0]["name"]), disks)


def encode_ecs(region: str, flavor: str, billing: Billing = "monthly", *, calc: Calculator | None = None,
               image: str = "AlmaLinux", system_disk: tuple = ("GPSSD", 40), data_disks: list | None = None,
               **options: Any) -> dict[str, Any]:
    """One ECS card built by the calculator page itself, anonymously, in a fresh browser context."""
    from autocalc.page.browser import page_context
    from autocalc.page.driver import Driver

    tokens = resolve_tokens(calc or Calculator(), region, flavor, image, system_disk, data_disks)
    steps = ecs_steps(region, tokens, billing, **options)
    with page_context(SERVICE) as ctx:
        driver = Driver(ctx.new_page(), SERVICE)
        driver.open()
        driver.run(steps)
        return driver.capture()
