/** Synthetic OBS catalog with all standard form lines for builder tests. */
export function standardObsCatalog(sizeFactor = "size") {
  return [sizeFactor, "download.external", "download.cdn", "download_crr", "get", "put", "delete"].map(factor => ({
    resourceSpecCode: factor === "download.cdn" ? "obs" : "obs.001", storageType: "dataInfo_2_", cloudServiceType: "c", resourceType: "r",
    planList: [{ billingMode: "ONDEMAND", productId: factor, usageFactor: factor }],
  }));
}
