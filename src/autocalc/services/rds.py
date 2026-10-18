"""RDS card builder (B5): instance (`rds.<engine>.<family>.<size>.<deploy>`) + volume."""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

GB = 17
VM_GROUP = "rds_rds.vm"
VOL_GROUP = "rds_rds.volume"


@register("rds")
def _factory(calc=None) -> RdsBuilder:
    return RdsBuilder(calc)


def _num(field: str | None) -> str:
    """'8BSSUNIT.pluralUnit.23' -> '8'."""
    return str(field or "").split("BSSUNIT")[0]


class RdsBuilder(Builder):
    service = "rds"
    spec_arg = "flavor"
    description = "Relational Database Service"
    modes = ("ondemand", "monthly", "yearly")

    def build(self, region: str, flavor: str, storage_spec: str, storage_gb: float = 40,
              billing: Billing = "ondemand", quantity: int = 1, periods: int = 1, hours: float = 730,
              db_version: str | None = None, title: str | None = None) -> dict[str, Any]:
        vm = self.product(self.catalog(region, VM_GROUP, flavor), billing, periods, hours)
        if db_version:
            vm["dbVersion"] = db_version
        spec_str = (f"{_num(vm.get('cpu'))}dataInfo_40_dataInfo_24_{_num(vm.get('mem'))}"
                    f"BSSUNIT.pluralUnit.{GB}dataInfo_66_")
        vm.update(addToList_title="calc_14_",
                  addToList_product=" | ".join(str(vm.get(k)) for k in
                                               ("azMode", "dbType", "dbVersion", "instanceType", "publicType"))
                                  + " | " + spec_str)

        vol = self.product(self.catalog(region, VOL_GROUP, storage_spec), billing, periods, hours)
        vol.update(resourceSize=storage_gb, resouceSizeMeasureId=GB, resourceMeasureName="", resourceMeasurePluralName="",
                   addToList_title="calc_6_", addToList_product=f"{vol.get('type')} | {storage_gb:g}BSSUNIT.pluralUnit.{GB}")

        render = {
            "calculator_rdsvm_radio": {k: vm.get(k) for k in ("dbType", "dbVersion", "instanceType", "azMode", "publicType")},
            "calculator_rdsvm_radio2": {"spec": spec_str},
            "calculator_rdsvolume_stepper": {"type": vol.get("type"), "UNSET_Stepper_0": _stepper(GB, storage_gb)},
        }
        return self.assemble(region, billing, periods, hours, quantity, [vm, vol], self.description, render, title=title)
