import { expect, test } from "bun:test";
import { rebuildInput } from "../support/rebuild.ts";

test("EIP rebuild converts saved TB traffic into GB", () => {
  const input = rebuildInput({ selectedProduct: { serviceCode: "eip", region: "sa-brazil-1", chargeModeName: "ONDEMAND", productAllInfos: [{ resourceType: "hws.resource.type.bandwidth", usageFactor: "upflow", usageValue: 2, usageMeasureId: 9 }, { resourceType: "hws.resource.type.ip", productNum: 1, usageValue: 730 }] }, rewriteValue: { template_RENDER: {} } });
  expect(input).toMatchObject({ service: "eip", traffic_gb: 2048 });
});

test("FunctionGraph rebuild converts stored million-request units to requests", () => {
  const input = rebuildInput({ selectedProduct: { serviceCode: "function", region: "sa-brazil-1", chargeModeName: "ONDEMAND", productAllInfos: [{ usageFactor: "request", usageValue: 0.32 }, { usageFactor: "compute", usageValue: 71360 }] }, rewriteValue: { template_RENDER: { calculator_fgs_request: { UNSET_Stepper_0: { measureValue: 32 } }, calculator_fgs_memory: { UNSET_Stepper_0: { measureValue: 512 } }, calculator_fgs_compute: "446" } } });
  expect(input).toMatchObject({ service: "function", requests: 320000, gb_seconds: 71360, memory_mb: 512, compute_units: 446 });
});

test("ECS rebuild keeps OS suffix, image, data disks, and reserved term", () => {
  const input = rebuildInput({ selectedProduct: { serviceCode: "ecs", region: "sa-brazil-1", chargeModeName: "RI", periodNum: 1, productAllInfos: [{ resourceType: "hws.resource.type.vm", resourceSpecCode: "c7.large.2.win", productNum: 3 }, { resourceType: "hws.resource.type.volume", resourceSpecCode: "GPSSD", resourceSize: 40 }, { resourceType: "hws.resource.type.volume", resourceSpecCode: "SSD", resourceSize: 100 }] }, rewriteValue: { template_RENDER: { calculator_ims_select: { name: "Windows Server" }, calculator_ecs_RIRadio: { RITime: "nodeData.1_3" } } } });
  expect(input).toMatchObject({ service: "ecs", flavor: "c7.large.2.win", image: "Windows Server", quantity: 3, system_disk: ["GPSSD", 40], data_disks: [["SSD", 100]], ri_time: "nodeData.1_3" });
});

test("EVS rebuild recovers configured IOPS and throughput", () => {
  const input = rebuildInput({ selectedProduct: { serviceCode: "evs", region: "sa-brazil-1", chargeModeName: "ONDEMAND", productAllInfos: [{ resourceSpecCode: "GPSSD2.storage", resourceSize: 100, productNum: 1, usageValue: 730 }] }, rewriteValue: { template_RENDER: { calculator_evs_iops: { UNSET_Stepper_0: { measureValue: 4000 } }, calculator_evs_throughput: { UNSET_Stepper_0: { measureValue: 200 } } } } });
  expect(input).toMatchObject({ service: "evs", type: "GPSSD2", iops: 4000, throughput: 200 });
});

test("OBS rebuild retains storage units and component factors", () => {
  const input = rebuildInput({ selectedProduct: { serviceCode: "obs", region: "sa-brazil-1", chargeModeName: "ONDEMAND", productAllInfos: [{ resourceSpecCode: "obs.001", storageType: "dataInfo_2_", usageFactor: "size", usageValue: 150, usageMeasureId: 9 }, { resourceSpecCode: "obs.001", usageFactor: "get", usageValue: 10, usageMeasureId: 54 }] }, rewriteValue: { template_RENDER: { calculator_multiAZ_radio: { multiAZType: "dataInfo_4_" } } } });
  expect(input).toMatchObject({ service: "obs", storage_class: "standard", components: [{ factor: "size", value: 150, unit: "TB" }, { factor: "get", value: 10, unit: "GB" }] });
});
