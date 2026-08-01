import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  buildCsv,
  cleanAuthUrl,
  dataAfterLoad,
  defaultFilters,
  formatBusinessDate,
  isLatestRequest,
  normalizeKpis,
  toRpcParams,
} from "./dashboard";

describe("filter dashboard", () => {
  it("membuat rentang 30 hari berdasarkan zona waktu Asia/Makassar", () => {
    const filters = defaultFilters(new Date("2026-07-26T16:30:00.000Z"));
    expect(filters.dateTo).toBe("2026-07-27");
    expect(filters.dateFrom).toBe("2026-06-28");
  });

  it("mengirim filter kosong sebagai null ke RPC", () => {
    expect(
      toRpcParams({
        dateFrom: "2026-07-01",
        dateTo: "2026-07-26",
        marketplace: "SHOPEE",
        store: "",
        location: "",
        status: "COMPLETED",
        settlementStatus: "SETTLED",
      }),
    ).toEqual({
      p_date_from: "2026-07-01",
      p_date_to: "2026-07-26",
      p_marketplace: "SHOPEE",
      p_store: null,
      p_location: null,
      p_status_group: "COMPLETED",
      p_settlement_status: "SETTLED",
    });
  });

  it("memformat tanggal kalender bisnis tanpa bergeser hari", () => {
    expect(formatBusinessDate("2026-07-26")).toContain("26");
  });
});

describe("state request dan refresh", () => {
  it("mengabaikan respons lama yang datang setelah request terbaru", () => {
    expect(isLatestRequest(4, 5)).toBe(false);
    expect(isLatestRequest(5, 5)).toBe(true);
  });

  it("memasang snapshot baru setelah refresh berhasil", () => {
    expect(dataAfterLoad({ revenue: 100 }, { revenue: 250 }, null)).toEqual({
      revenue: 250,
    });
  });

  it("mempertahankan data terakhir jika refresh gagal", () => {
    const current = { revenue: 100, orders: 3 };
    expect(dataAfterLoad(current, null, new Error("network"))).toBe(current);
  });
});

describe("normalisasi dan keamanan tampilan", () => {
  it("mengubah angka Postgres berbentuk string menjadi number", () => {
    const kpis = normalizeKpis({
      order_count: "12" as unknown as number,
      revenue: "450000" as unknown as number,
      total_available: "-4" as unknown as number,
    });
    expect(kpis.order_count).toBe(12);
    expect(kpis.revenue).toBe(450000);
  });

  it("membersihkan token autentikasi dari URL setelah diproses", () => {
    const clean = cleanAuthUrl(
      new URL(
        "https://example.com/jubelio-dashboard/?error=access_denied#access_token=secret&refresh_token=secret2&type=recovery",
      ),
    );
    expect(clean).toBe("/jubelio-dashboard/");
    expect(clean).not.toContain("secret");
  });

  it("memberi instruksi jelas untuk tautan kedaluwarsa", () => {
    expect(authErrorMessage("otp_expired", "Email link is invalid or has expired")).toContain(
      "kedaluwarsa",
    );
  });

  it("menghasilkan CSV yang aman untuk koma dan tanda kutip", () => {
    expect(buildCsv(["Nama"], [['Produk "A", besar']])).toBe(
      '"Nama"\r\n"Produk ""A"", besar"',
    );
  });
});
