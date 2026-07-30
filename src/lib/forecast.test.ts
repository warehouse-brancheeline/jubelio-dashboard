import { describe, expect, it } from "vitest";
import {
  defaultForecastParameters,
  forecastDateRange,
  forecastRpcParams,
  normalizeForecast,
  sortForecastRows,
} from "./forecast";
import type { ForecastRow } from "../types";

describe("parameter forecast", () => {
  const date = new Date("2026-07-30T04:00:00.000Z");

  it("membuat periode 1, 2, dan 3 bulan dengan hari kalender inklusif", () => {
    expect(forecastDateRange("1_month", date)).toEqual({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-30",
    });
    expect(forecastDateRange("2_months", date).dateFrom).toBe("2026-06-01");
    expect(forecastDateRange("3_months", date).dateFrom).toBe("2026-05-02");
  });

  it("mengubah level layanan 95 persen menjadi z-score 1,65", () => {
    const params = forecastRpcParams(defaultForecastParameters(date));
    expect(params.p_z_score).toBe(1.65);
    expect(params.p_trend_floor).toBe(-0.3);
    expect(params.p_trend_cap).toBe(0.5);
  });

  it("menormalisasi angka dari respons Postgres", () => {
    const data = normalizeForecast({
      summary: { product_count: "12", recommended_units: "40" },
      coverage: { analysis_days: "30", coverage_percentage: "2.5" },
      assumptions: {},
      rows: [
        {
          item_id: "1",
          sku: "A",
          product_name: "Produk A",
          recommended_restock: "10",
          trend_percentage: null,
          days_until_stockout: "4.5",
        },
      ],
    });
    expect(data.summary.product_count).toBe(12);
    expect(data.rows[0].recommended_restock).toBe(10);
    expect(data.rows[0].days_until_stockout).toBe(4.5);
  });

  it("mengurutkan angka, teks, prioritas, dan nilai kosong", () => {
    const row = (overrides: Partial<ForecastRow>) => ({
      sku: "",
      product_name: "",
      priority: "Rendah",
      confidence_level: "Rendah",
      estimated_stockout_date: null,
      ...overrides,
    }) as ForecastRow;
    const rows = [
      row({ sku: "SKU-10", stock_available: 2, priority: "Rendah" }),
      row({ sku: "SKU-2", stock_available: 20, priority: "Kritis", estimated_stockout_date: "2026-08-01" }),
      row({ sku: "SKU-1", stock_available: 5, priority: "Tinggi", estimated_stockout_date: "2026-07-31" }),
    ];

    expect(sortForecastRows(rows, "sku", "asc").map((item) => item.sku))
      .toEqual(["SKU-1", "SKU-2", "SKU-10"]);
    expect(sortForecastRows(rows, "stock_available", "desc").map((item) => item.stock_available))
      .toEqual([20, 5, 2]);
    expect(sortForecastRows(rows, "priority", "asc").map((item) => item.priority))
      .toEqual(["Kritis", "Tinggi", "Rendah"]);
    expect(sortForecastRows(rows, "estimated_stockout_date", "asc").map((item) => item.sku))
      .toEqual(["SKU-1", "SKU-2", "SKU-10"]);
  });
});
