"""GeminiDB card builder (DynamoDB-compatible API, Cloud native / GeminiFS storage).

DynamoDB-compatible instances are sold as the ``geminidb.cassandra*`` SKUs with
``versionType == dataInfo_71_`` (config bundle ``/config?urlPath=nosql``, ``versionMap``).
Cloud native = ``geminidb.cassandra-geminifs.<flavor>`` (deploymentModal ``dataInfo_65_``) plus the
``geminidb.cassandra-geminifs.ultrahigh`` volume (priced per GB, ``resourceSize`` = total GB).
The card shape and render template were taken from a real saved card
(corpus ``a71269d0...``: large.4 x2 nodes + 10 GB = 637.35/month) and verified against the
portal price page (large.4 x2 + 100 GB = 671.10/month, sa-brazil-1).

    uv run python -c "from autocalc.services.nosql import NosqlBuilder; print(NosqlBuilder().build('sa-brazil-1')['selectedProduct']['amount'])"
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.errors import SpecNotFound
from autocalc.services.base import Builder, _stepper, register

VM_GROUP = "nosql_nosql.vm"
VOL_GROUP = "nosql_nosql.volume"
ENGINE = {"dynamodb": "dataInfo_71_"}
NATIVE_VM = "geminidb.cassandra-geminifs.{flavor}"
NATIVE_VOL = "geminidb.cassandra-geminifs.ultrahigh"
MODAL_NATIVE = "dataInfo_65_"


@register("nosql")
class NosqlBuilder(Builder):
    service = "nosql"
    description = "GeminiDB DynamoDB"

    def _vm(self, region: str, flavor: str, engine_token: str) -> dict[str, Any]:
        import json
        code = NATIVE_VM.format(flavor=flavor)
        for it in self.calc.product_info(self.service, region)["product"].get(VM_GROUP, []):
            if it.get("resourceSpecCode") == code and it.get("versionType") == engine_token \
                    and it.get("deploymentModal") == MODAL_NATIVE:
                return json.loads(json.dumps(it))
        raise SpecNotFound(f"{code!r} (DynamoDB, Cloud native) not sold in {region} for nosql")

    def build(self, region: str, flavor: str = "large.4", nodes: int = 2, storage_gb: float = 100,
              billing: Billing = "monthly", periods: int = 1, hours: float = 730,
              title: str | None = None, engine: str = "dynamodb") -> dict[str, Any]:
        token = ENGINE[engine]
        cat = self._vm(region, flavor, token)
        inst = self.product(cat, billing, periods, hours)
        spec = cat["spec"]
        inst.update(addToList_title="calc_1_",
                    addToList_product=f"{token} | {MODAL_NATIVE} | {cat['type']} | {cat['version']} | "
                                      f"{cat['cpuType']} | {spec} | {nodes} detail_37_",
                    productNum=nodes)
        vol_cat = self.catalog(region, VOL_GROUP, NATIVE_VOL)
        vol = self.product(vol_cat, billing, periods, hours)
        vol.update(resourceSize=storage_gb, resouceSizeMeasureId=17, resourceMeasureName="",
                   resourceMeasurePluralName="", addToList_title="calc_3_",
                   addToList_product=f"calc_4_ | {storage_gb:g}BSSUNIT.pluralUnit.17", productNum=1)
        render = {
            "calculator_nosql_versionType_group": {"versionType": token, "deploymentModal": MODAL_NATIVE},
            "calculator_nosql_versionType_radio": {"type": cat["type"], "version": cat["version"],
                                                   "cpuType": cat["cpuType"]},
            "calculator_nosql_vm_select": {"spec": spec},
            "calculator_nosql_colony_node_stepper": {"UNSET_Stepper_0": _stepper(41, nodes, "dataInfo_12_")},
            "calculator_nosql_rs_stepper": {"ioType": "calc_4_", "UNSET_Stepper_0": _stepper(17, storage_gb)},
        }
        buy = (f"https://console-intl.huaweicloud.com/nosql/?region={region}&locale=en-us&payMode="
               f"{'1' if billing != 'ondemand' else '0'}&dbType=DynamoDB&version=3.11&flavorId={flavor}"
               f"&volume={storage_gb:g}&buyTime={periods}&nodeNum={nodes}&mode=custom#/instance/create")
        return self.assemble(region, billing, periods, hours, 1, [inst, vol], self.description, render,
                             title=title, buy_url=buy, include_quantity=False)
