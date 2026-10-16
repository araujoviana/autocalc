"""DMS (for RabbitMQ) card builder.

SQS -> Huawei DMS RabbitMQ. Per-flavour pricing model (from the portal config bundle
``/config?urlPath=rabbitMQ`` + a live card): the instance SKU's monthly plan is a
per-rate-unit price and the card carries ``resourceSize = conversion_rate(specId) * brokers``;
the inquiry prices ``plan * resourceSize``. Storage is priced linearly (per 1000 GB).

Scope (user): only non-AMQP versions (3.8.35 onward), i.e. the ``c6.*`` flavours; the
AMQP-0-9-1 flavours are supported but excluded by default (the project scope targets
non-AMQP flavours).
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

INSTANCE_GROUP = "dms_dms.platinum"
STORAGE_GROUP = "dms_dms.storage"
INSTANCE_SPEC = "dms.platinum.c6.rabbitmq"
STORAGE_SPEC = "dms.physical.storage.ultra.v2.rabbitmq"

# specId -> conversion rate (resourceSize units per broker); from the config bundle.
RATE_3835 = {"c6.2u4g.single": 7, "c6.4u8g.single": 14, "c6.8u16g.single": 27, "c6.16u32g.single": 50,
             "c6.24u48g.single": 75, "c6.2u4g.cluster": 7, "c6.4u8g.cluster": 14, "c6.8u16g.cluster": 27,
             "c6.12u24g.cluster": 41, "c6.16u32g.cluster": 50, "c6.24u48g.cluster": 75,
             "c6.32u64g.cluster": 100}
RATE_AMQP = {"amqp.p1.large.2": 7, "amqp.p1.large.4": 14, "amqp.p2.large.6": 21, "amqp.p2.large.10": 35,
             "amqp.p2.large.14": 49, "amqp.p2.large.20": 70, "amqp.p2.large.28": 98, "amqp.p2.large.40": 135,
             "amqp.p2.large.56": 189, "amqp.p2.large.80": 205, "amqp.p2.large.112": 387,
             "amqp.p2.large.144": 300, "amqp.p2.large.200": 375, "amqp.p2.large.240": 500,
             "amqp.p2.large.280": 525}
BROKERS = {"c6.2u4g.single": [1], "c6.4u8g.single": [1], "c6.8u16g.single": [1], "c6.16u32g.single": [1],
           "c6.24u48g.single": [1], "c6.2u4g.cluster": [3, 5, 7], "c6.4u8g.cluster": [3, 5, 7],
           "c6.8u16g.cluster": [3, 5, 7], "c6.12u24g.cluster": [3, 5, 7], "c6.16u32g.cluster": [3, 5, 7],
           "c6.24u48g.cluster": [3, 5, 7], "c6.32u64g.cluster": [3, 5, 7]}
VERSION_TOKENS = {"3.8": "dataInfo_30_", "amqp": "dataInfo_29_"}


def _rate(spec_id: str) -> int:
    if spec_id in RATE_3835:
        return RATE_3835[spec_id]
    return RATE_AMQP[spec_id]


@register("rabbitmq")
class RabbitMqBuilder(Builder):
    service = "rabbitMQ"
    description = "DMS (for RabbitMQ)"

    def build(self, region: str, spec_id: str = "c6.2u4g.single", storage_gb: float = 100,
              brokers: int = 1, billing: Billing = "monthly", periods: int = 1, quantity: int = 1,
              hours: float = 730, version: str = "3.8", title: str | None = None) -> dict[str, Any]:
        arch = "cluster" if spec_id.endswith(".cluster") else "single"
        cap = _rate(spec_id) * brokers
        cat = self.catalog(region, INSTANCE_GROUP, INSTANCE_SPEC, spec_id=spec_id)
        inst = self.product(cat, billing, periods, hours)
        inst.update(resourceSpecType="ResourceGroup", instanceUnit="detail_19_",
                    specName=cat["specName"], versionType=VERSION_TOKENS.get(version, "dataInfo_30_"),
                    architectureId=arch, architectureName=cat["architectureName"], addToList_title="calc_6_",
                    addToList_product=f"{cat['architectureName']} | {spec_id} | calc_7_detail_39_{brokers}",
                    resourceSize=cap, resouceSizeMeasureId=14, cpqPurchaseCapacity=cap, nodeNum=brokers)
        total_gb = storage_gb * brokers
        store = self.product(self.catalog(region, STORAGE_GROUP, STORAGE_SPEC), billing, periods, hours)
        store.update(resourceSpecType="DEFAULT", resourceSize=total_gb, resouceSizeMeasureId=17,
                     resourceMeasureName="", resourceMeasurePluralName="", addToList_title="detail_43_",
                     storageType="dataInfo_12_",
                     addToList_product=f"dataInfo_12_ | {total_gb:g}GB ( calc_8_: {total_gb:g}GB )")
        render = {
            "calculator_rabbitMQ_version_switch": {"UNSET_Switch": inst["versionType"]},
            "calculator_rabbitMQ_architecture_switch": {"architectureName": cat["architectureName"]},
            "calculator_rabbitMQ_specType_switch": {"specName": cat["specName"]},
            "calculator_rabbitMQ_node_num_stepper": {"UNSET_Stepper_0": _stepper(14, brokers, "calc_9_", "calc_10_")},
            "calculator_rabbitMQ_new_storage_stepper": {"storageType": "dataInfo_12_",
                                                        "UNSET_Stepper_0": _stepper(17, total_gb)},
        }
        return self.assemble(region, billing, periods, hours, quantity, [inst, store], self.description,
                             render, title=title)
