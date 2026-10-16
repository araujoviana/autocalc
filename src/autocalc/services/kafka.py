"""DMS (for Kafka) card builder.

Kinesis -> Huawei DMS Kafka. Same pricing model as RabbitMQ (see rabbitmq.py): the instance
SKU's monthly plan is a per-rate-unit price and the card carries
``resourceSize = conversion_rate(specId) * brokers``; the inquiry prices plan * resourceSize.
Storage is priced linearly (per 1000 GB). Rate table + template are taken from the portal
config bundle (``/config?urlPath=kafka``) and a live card.

    uv run python -c "from autocalc.services.kafka import KafkaBuilder; print(KafkaBuilder().build('ap-southeast-1', spec_id='kafka.2u4g.single.small', brokers=1, storage_gb=100)['selectedProduct']['amount'])"
"""

from __future__ import annotations

from typing import Any

from autocalc.client import Billing
from autocalc.services.base import Builder, _stepper, register

INSTANCE_GROUP = "dms_dms.platinum"
STORAGE_GROUP = "dms_dms.storage"
INSTANCE_SPEC = "dms.platinum.c6.kafka"
STORAGE_SPEC = "dms.physical.storage.ultra.v2.kafka"

# specId -> conversion rate (resourceSize units per broker); from the config bundle.
RATE = {"kafka.2u4g.single.small": 5, "kafka.2u4g.single": 7, "s6.2u4g.cluster.small": 5,
        "c6.2u4g.cluster": 7, "c6.4u8g.cluster": 14, "c6.8u16g.cluster": 27,
        "c6.12u24g.cluster": 41, "c6.16u32g.cluster": 50}
STORAGE_TYPE = "dataInfo_7_"


@register("kafka")
class KafkaBuilder(Builder):
    service = "kafka"
    description = "DMS (for Kafka)"

    def build(self, region: str, spec_id: str = "kafka.2u4g.single.small", storage_gb: float = 100,
              brokers: int = 1, billing: Billing = "monthly", periods: int = 1, quantity: int = 1,
              hours: float = 730, title: str | None = None) -> dict[str, Any]:
        cap = RATE[spec_id] * brokers
        cat = self.catalog(region, INSTANCE_GROUP, INSTANCE_SPEC, spec_id=spec_id)
        inst = self.product(cat, billing, periods, hours)
        inst.update(resourceSpecType="ResourceGroup", specName=cat.get("specName"),
                    architectureName=cat.get("architectureName"), addToList_title="calc_5_",
                    addToList_product=f"{cat.get('specName')} | calc_4_detail_32_{brokers}",
                    resourceSize=cap, resouceSizeMeasureId=14, resourceMeasureName="",
                    resourceMeasurePluralName="", cpqPurchaseCapacity=cap, nodeNum=brokers)
        total_gb = storage_gb * brokers
        store = self.product(self.catalog(region, STORAGE_GROUP, STORAGE_SPEC), billing, periods, hours)
        store.update(resourceSpecType="ResourceGroup", storageType=STORAGE_TYPE, storageUnit="detail_9_",
                     resourceSize=total_gb, resouceSizeMeasureId=17, resourceMeasureName="",
                     resourceMeasurePluralName="", addToList_title="detail_35_",
                     addToList_product=f"{STORAGE_TYPE} | {total_gb:g}GB")
        render = {
            "calculator_kafka_architecture_switch": {"architectureName": cat.get("architectureName")},
            "calculator_kafka_specType_switch": {"specName": cat.get("specName")},
            "calculator_kafka_node_num_stepper": {"UNSET_Stepper_0": _stepper(14, brokers)},
            "calculator_kafka_new_storage_stepper": {"storageType": STORAGE_TYPE,
                                                     "UNSET_Stepper_0": _stepper(17, total_gb)},
        }
        return self.assemble(region, billing, periods, hours, quantity, [inst, store], self.description,
                             render, title=title)
