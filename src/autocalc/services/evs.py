"""EVS standalone card builder (B2): one volume, optionally with GPSSD2/ESSD2 IOPS
and throughput SKUs.

Corpus: 35 cards in every mode (ONDEMAND 25, MONTHLY 5, YEARLY 5).
One product ``hws.resource.type.volume`` in the ``ebs_volume`` group; labels
``calc_4_`` (title) and ``<productType> | <size>detail_42_`` (product). On-demand
GPSSD2/ESSD2 add two more products, ``<type>.iops`` and ``<type>.throughput``,
billed per hour (``usageValue`` is the part above the free baseline).
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import CONSOLE, Builder, _stepper, register

GB = 17
# volume size measurement label used in the label token ``<size>detail_42_``
SIZE_MEASURE = "detail_42_"
# label tokens for the GPSSD2/ESSD2 add-on products
IOPS_TITLE, IOPS_MEASURE = "detail_28_", "detail_36_"
TP_TITLE, TP_MEASURE = "detail_29_", "detail_35_"
# free baseline included with every GPSSD2/ESSD2 volume (Huawei spec); the
# billable ``usageValue`` is what the user configures above this baseline.
IOPS_BASELINE = 3000
TP_BASELINE = 125

EXTRA_TYPES = ("GPSSD2", "ESSD2")
# volume type -> productType label token (from /config?urlPath=evs)
PRODUCT_TYPE = {"SATA": "calc_1_", "SAS": "calc_2_", "SSD": "calc_3_", "GPSSD": "calc_7_",
                "ESSD": "calc_8_", "GPSSD2": "calc_9_", "ESSD2": "calc_10_"}


@register("evs")
def _factory(calc=None) -> EvsBuilder:
    return EvsBuilder(calc)


class EvsBuilder(Builder):
    service = "evs"
    description = "Elastic Volume Service"
    modes = ("ondemand", "monthly", "yearly")

    def build(self, region: str, type: str = "GPSSD", size_gb: int = 100, quantity: int = 1,
              billing: Billing = "ondemand", periods: int = 1, hours: float = 730,
              iops: int | None = None, throughput: int | None = None,
              title: str | None = None) -> dict[str, Any]:
        spec = type if type not in EXTRA_TYPES else f"{type}.storage"
        vol = self.product(self.catalog(region, "ebs_volume", spec), billing, periods, hours)
        vol.update(resourceSize=size_gb, resouceSizeMeasureId=GB,
                   resourceMeasureName=SIZE_MEASURE, resourceMeasurePluralName=SIZE_MEASURE,
                   addToList_title="calc_4_",
                   addToList_product=f"{vol.get('productType', '')} | {size_gb}{SIZE_MEASURE}")
        vol["productNum"] = quantity

        products: list[dict[str, Any]] = [vol]

        # GPSSD2/ESSD2 in on-demand also bill IOPS and throughput per hour. The
        # card stores the configured total in ``addToList_product`` and only the
        # part above the free baseline in ``usageValue``.
        if type in EXTRA_TYPES and billing == "ondemand":
            total_iops = IOPS_BASELINE if iops is None else int(iops)
            total_tp = TP_BASELINE if throughput is None else int(throughput)
            bill_hours = int(quantity * hours)
            iop = self._addon(region, f"{type}.iops", billing, periods, hours)
            iop.update(usageValue=max(0, total_iops - IOPS_BASELINE),
                       usageMeasureId=iop["measureUnit"], usageMeasureName=IOPS_MEASURE,
                       usageMeasurePluralName=IOPS_MEASURE,
                       addToList_title=IOPS_TITLE,
                       addToList_product=f"{total_iops}{IOPS_MEASURE}",
                       productNum=bill_hours, durationNum=hours)
            tp = self._addon(region, f"{type}.throughput", billing, periods, hours)
            tp.update(usageValue=max(0, total_tp - TP_BASELINE),
                      usageMeasureId=tp["measureUnit"], usageMeasureName=TP_MEASURE,
                      usageMeasurePluralName=TP_MEASURE,
                      addToList_title=TP_TITLE,
                      addToList_product=f"{total_tp}{TP_MEASURE}",
                      productNum=bill_hours, durationNum=hours)
            products += [iop, tp]

        render: dict[str, Any] = {
            "calculator_product_stepper": {
                "UNSET_Stepper_0": _stepper(GB, size_gb, SIZE_MEASURE, SIZE_MEASURE),
                "productType": PRODUCT_TYPE.get(type, "calc_7_"),
            },
        }
        if type in EXTRA_TYPES and billing == "ondemand":
            render["calculator_evs_iops"] = {"UNSET_Stepper_0": _stepper(75, total_iops, "detail_36_", "detail_36_")}
            render["calculator_evs_throughput"] = {"UNSET_Stepper_0": _stepper(77, total_tp, "detail_35_", "detail_35_")}
        return self.assemble(region, billing, periods, hours, quantity, products, self.description,
                            render, title=title, quantity_tokens=("calc_5_", "calc_6_"), buy_url=self._buy_url(region, type, size_gb, quantity,
                                                                       billing, periods, iops, throughput))

    def _addon(self, region: str, spec: str, billing: Billing, periods: int,
               hours: float) -> dict[str, Any]:
        """A GPSSD2/ESSD2 IOPS or throughput SKU, priced like its own product."""
        p = self.product(self.catalog(region, "ebs_volume", spec), billing, periods, hours)
        p["inquiryTag"] = "normal"
        return p

    @staticmethod
    def _buy_url(region: str, type: str, size_gb: int, quantity: int, billing: Billing,
                 periods: int, iops: int | None, throughput: int | None) -> str:
        period = "" if billing == "ondemand" else f"{periods}{'m' if billing == 'monthly' else 'y'}"
        iop = str(iops) if (iops is not None and billing == "ondemand") else ""
        tp = str(throughput) if (throughput is not None and billing == "ondemand") else ""
        return (f"{CONSOLE}?region={region}&locale=en-us&charging={0 if billing == 'ondemand' else 1}"
                f"&type={type}&capacity={size_gb}&count={quantity}&iops={iop}&throughput={tp}"
                f"&period={period}#/evs/createvolume")
