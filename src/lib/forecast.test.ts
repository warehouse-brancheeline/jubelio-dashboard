import { describe, expect, it } from "vitest";
import {
  defaultForecastParameters,
  forecastDateRange,
  forecastRpcParams,
  normalizeForecast,
} from "./forecast";

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
});
