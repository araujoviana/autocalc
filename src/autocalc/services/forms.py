"""Services with no Python builder: a recipe names the page's controls, the page builds the card.

A recipe maps an option name to the config id of a control on the service's calculator page
(``autocalc page-controls <service>`` lists them). The option's value is passed to the control
as the page offers it (``dataInfo_15_``, ``100BSSUNIT.pluralUnit.17``). Options the caller leaves
out keep the page's default; options are applied in the recipe's order because early choices
narrow later ones.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from autocalc.client import Billing
from autocalc.errors import ValidationError
from autocalc.services.base import CHARGE, HOUR_MEASURE_ID, Builder, _stepper, register


@dataclass(frozen=True)
class Recipe:
    description: str
    controls: dict[str, str]
    hours: bool = False  # the on-demand form asks for hours per month
    quantity: bool = False  # the form has the global quantity stepper
    regionless: bool = False  # a global service: the page has no region control
    modes: tuple[str, ...] = ("monthly", "yearly", "ondemand")


RECIPES: dict[str, Recipe] = {
    "redis": Recipe("Distributed Cache Service (Redis)", {
        "instance_type": "calculator_redis_version_instance_type", "version": "calculator_redis_version_version",
        "edition": "calculator_redis_version_edition", "cpu_storage": "calculator_redis_version_cpu_storage",
        "spec": "calculator_redis_version_spec", "instances": "calculator_redis_quantity_Stepper_0"},
        modes=("monthly", "yearly")),  # on-demand prices at 0.00 in sa-brazil-1
    "memcached": Recipe("Distributed Cache Service (Memcached)", {
        "instance_type": "calculator_memcached_version_instance_type",
        "memory_gb": "calculator_memcached_version_Stepper_0"}, hours=True, quantity=True, modes=('ondemand',)),
    "dds": Recipe("Document Database Service", {
        "type": "calculator_dds_versionType_radio_type", "flavor_type": "calculator_dds_versionType_radio_flavorType",
        "shard_spec": "calculator_dds_colony_shard_spec", "shards": "calculator_dds_colony_shard_Stepper_0",
        "shard_storage_gb": "calculator_dds_colony_shard_volume_Stepper_0"}, quantity=True),
    "gaussdb": Recipe("GaussDB", {
        "deploy_model": "calculator_opgauss_radio_deployModel", "instance_type": "calculator_opgauss_radio_insType",
        "db_version": "calculator_opgauss_radio_dbOpenGaussVersion", "database_type": "calculator_opgauss_radio_databseType",
        "public_type": "calculator_opgauss_spec_radio_publicOpengaussType", "spec": "calculator_opgauss_spec_radio_spec",
        "storage_gb": "calculator_openGauss_volume_stepper_Stepper_0"}, quantity=True),
    "rdsformariadb": Recipe("RDS for MariaDB", {
        "instance_type": "calculator_rdsvm_radio_instanceType", "db_version": "calculator_rdsvm_radio_dbVersion",
        "public_type": "calculator_rdsvm_radio_publicType", "spec": "calculator_rdsvm_radio2_spec",
        "storage_gb": "calculator_rdsvolume_stepper_Stepper_0"}, quantity=True),
    "taurusdb": Recipe("TaurusDB", {
        "enterprise_instance": "calculator_gaussdb_radio_enterpriseInstance",
        "public_type": "calculator_gaussdb_publicType_switch_publicGaussdbType",
        "spec": "calculator_gaussdb_publicType_switch_spec", "nodes": "calculator_gaussdb_publicType_switch_Stepper_0",
        "storage_gb": "calculator_gaussdb_volume_stepper_Stepper_0"}, quantity=True),
    "hrds": Recipe("Dedicated RDS", {
        "instance_type": "calculator_rdsvm_radio_instanceType", "db_type": "calculator_rdsvm_radio_dbType",
        "db_version": "calculator_rdsvm_radio_dbVersion", "spec": "calculator_rdsvm_radio2_spec",
        "storage_gb": "calculator_rdsvolume_stepper_Stepper_0"}, quantity=True, modes=('monthly', 'yearly')),
    "ddm": Recipe("Distributed Database Middleware", {
        "spec_type": "calculator_insSpec_radio_specType", "spec": "calculator_insSpec_radio_specBefore"}, quantity=True),
    "drs": Recipe("Data Replication Service", {
        "type": "calculator_drsvm_radio_drsType", "flow": "calculator_drsvm_radio_flowInout",
        "specification": "calculator_drsvm_radio_specificationType"}, quantity=True),
    "sfs": Recipe("Scalable File Service", {
        "capacity_gb": "calculator_sfsDemand_radio_Stepper_0"}, hours=True, modes=("ondemand",)),
    "dss": Recipe("Dedicated Distributed Storage Service", {
        "type": "calculator_dssDemand_radio_type", "capacity": "calculator_dssDemand_radio_dssDivision"}, modes=('yearly',)),
    "sdrs": Recipe("Storage Disaster Recovery Service", {
        "protection_groups": "calculator_sdrs_stepper_Stepper_0"}, hours=True, modes=('ondemand',)),
    "des": Recipe("Data Express Service", {
        "transfer_type": "calculator_product_select_transferTypeClass", "devices": "calculator_product_stepper_Stepper_0"},
        quantity=True, modes=('ondemand',)),
}

# builder-wave-3: networking, security, middleware and Flexus; first pass runs on the page's defaults
_PM, _OD = ("monthly", "yearly"), ("ondemand",)
RECIPES.update({
    "er": Recipe("Enterprise Router", {"downflow_gb": "calculator_downflow_stepper_Stepper_0", "attachment_hours": "calculator_attachment_time_stepper_Stepper_0", "attachments": "calculator_attachment_stepper_Stepper_0"}, modes=_OD),
    "esw": Recipe("Enterprise Switch", {}, modes=_PM + _OD),
    "vpcep": Recipe("VPC Endpoint", {}, modes=_OD),
    "eip": Recipe("Elastic IP", {}, modes=_PM + _OD),
    "vpn": Recipe("Virtual Private Network", {}, modes=_PM + _OD),
    "cfw": Recipe("Cloud Firewall", {}, modes=_PM + _OD),
    "hss": Recipe("Host Security Service", {}, quantity=True, modes=_PM + _OD),
    "dbss": Recipe("Database Security Service", {}, quantity=True, modes=_PM),
    "dsc": Recipe("Data Security Center", {}, quantity=True, modes=_PM),
    "ga": Recipe("Global Accelerator", {}, regionless=True, modes=_OD),
    "cc": Recipe("Cloud Connect", {}, quantity=True, regionless=True, modes=_PM),
    "aad": Recipe("Anti-DDoS Advanced", {}, quantity=True, regionless=True, modes=_PM),
    "edgesec": Recipe("Edge Security", {}, regionless=True, modes=("monthly",)),
    "ucs": Recipe("Ubiquitous Cloud Native Service", {}, regionless=True, modes=_PM + _OD),
    "ssa": Recipe("Situation Awareness", {"edition": "calculator_ssa_edition_version1"}, modes=_OD),
    "reliability": Recipe("Reliability (Distributed Message Service)", {}, quantity=True, modes=_PM + _OD),
    "hecs": Recipe("Flexus X Instance", {}, quantity=True, modes=_PM + _OD),
})


class FormBuilder(Builder):
    """Returns the form state for a recipe; the page turns it into the card."""

    def __init__(self, service: str, recipe: Recipe, calc: Any = None):
        super().__init__(calc)
        self.service, self.recipe, self.description = service, recipe, recipe.description
        self.modes = recipe.modes

    def build(self, region: str, billing: Billing = "monthly", periods: int = 1, quantity: int = 1,
              hours: float = 730, **options: Any) -> dict[str, Any]:
        if unknown := sorted(set(options) - set(self.recipe.controls)):
            raise ValidationError(f"{self.service} has no option {unknown[0]!r}.", field=unknown[0],
                                  allowed=sorted(self.recipe.controls))
        mode, _name, _period, measure = CHARGE[billing]
        form: dict[str, Any] = {"global_REGIONINFO": {**({} if self.recipe.regionless else {"region": region}),
                                                      "locationType": "commonAZ", "chargeMode": mode},
                                "template_RENDER": {self.recipe.controls[k]: options[k]
                                                    for k in self.recipe.controls if k in options}}
        if billing == "ondemand":
            if self.recipe.hours:
                form["global_ONDEMANDTIME"] = {"UNSET_Stepper_0": _stepper(HOUR_MEASURE_ID, hours)}
        else:
            form["global_PERIODTIME"] = {"UNSET_PeriodTime": {"measureValue": periods, "measureId": measure}}
        if self.recipe.quantity:
            form["global_QUANTITY"] = {"UNSET_Stepper_0": _stepper(41, quantity)}
        return {"rewriteValue": form}


def _register(service: str, recipe: Recipe) -> None:
    register(service)(lambda calc=None: FormBuilder(service, recipe, calc))


for _service, _recipe in RECIPES.items():
    _register(_service, _recipe)
