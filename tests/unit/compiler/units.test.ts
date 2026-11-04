import { describe, expect, it } from "bun:test";
import {
  parseBandwidth,
  parseCapacity,
  parseDuration,
  parseRequestRate,
  parseTraffic,
} from "../../../src/core/compiler/units.ts";
import { CalculatorError } from "../../../src/core/errors.ts";

describe("Physical Dimensional Unit Parser", () => {
  describe("Capacity", () => {
    it("rejects bare numbers to prevent unit confusion", () => {
      expect(() => parseCapacity(95043)).toThrow(CalculatorError);
      expect(() => parseCapacity(100, "storage")).toThrow(CalculatorError);
    });

    it("parses valid storage capacity units accurately", () => {
      const g1 = parseCapacity("100 GB");
      expect(g1.amount).toBe(100);
      expect(g1.inGB).toBe(100);
      expect(g1.inBytes).toBe(100 * 1024 ** 3);

      const t1 = parseCapacity("2 TB");
      expect(t1.inGB).toBe(2048);

      const gib = parseCapacity("500 GiB");
      expect(gib.inGB).toBe(500);

      const mib = parseCapacity("1024 MiB");
      expect(mib.inGB).toBe(1);
    });

    it("rejects unknown capacity units", () => {
      expect(() => parseCapacity("500 parsecs")).toThrow(CalculatorError);
      expect(() => parseCapacity("100 widgets")).toThrow(CalculatorError);
    });
  });

  describe("Bandwidth", () => {
    it("rejects bare numbers for bandwidth", () => {
      expect(() => parseBandwidth(100)).toThrow(CalculatorError);
    });

    it("parses bandwidth into Mbps", () => {
      const b1 = parseBandwidth("10 Mbit/s");
      expect(b1.inMbps).toBe(10);

      const b2 = parseBandwidth("1 Gbps");
      expect(b2.inMbps).toBe(1000);

      const b3 = parseBandwidth("500 kbit/s");
      expect(b3.inMbps).toBe(0.5);
    });
  });

  describe("Traffic", () => {
    it("parses periodic traffic volume into GB/month", () => {
      const t1 = parseTraffic("150 TB/mo");
      expect(t1.inGBPerMonth).toBe(150 * 1024);

      const t2 = parseTraffic("500 GB/month");
      expect(t2.inGBPerMonth).toBe(500);

      const t3 = parseTraffic("2 TB");
      expect(t3.inGBPerMonth).toBe(2048);
    });

    it("rejects bare numbers for traffic", () => {
      expect(() => parseTraffic(150)).toThrow(CalculatorError);
    });
  });

  describe("Duration", () => {
    it("parses hours, days, months, and years into standard hour bases", () => {
      const h = parseDuration("730 h");
      expect(h.inHours).toBe(730);
      expect(h.inMonths).toBe(1);

      const d = parseDuration("30 days");
      expect(d.inHours).toBe(720);
      expect(d.inDays).toBe(30);

      const y = parseDuration("1 y");
      expect(y.inHours).toBe(8760);
      expect(y.inMonths).toBe(12);
    });
  });

  describe("Request Rates", () => {
    it("parses numeric and shorthand request rates", () => {
      expect(parseRequestRate(50000).perMonth).toBe(50000);
      expect(parseRequestRate("50k").perMonth).toBe(50000);
      expect(parseRequestRate("10M/mo").perMonth).toBe(10_000_000);
      expect(parseRequestRate("2.5M").perMonth).toBe(2_500_000);
    });
  });
});
