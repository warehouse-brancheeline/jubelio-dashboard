import { AlertTriangle, Boxes, LoaderCircle, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useSyncHealth } from "./hooks/useSyncHealth";
import { formatDateTime, formatNumber } from "./lib/dashboard";
import type { SyncLogRow, SyncStateRow } from "./types";

type Props = {
  enabled: boolean;
  onRefreshFromJubelio: () => Promise<boolean>;
  refreshing: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  all_order_statuses: "Order aktif dan selesai (semua tahapan)",
  completed_orders_backfill: "Backfill histori order selesai",
  forecast_order_items_backfill: "Backfill detail item order (forecast)",
  inventory: "Persediaan dan produk",
};

const SOURCE_ORDER = [
  "all_order_statuses",
  "inventory",
  "completed_orders_backfill",
  "forecast_order_items_backfill",
];

function sourceLabel(syncType: string): string {
  return SOURCE_LABELS[syncType] ?? syncType;
}

function statusLabel(status: string): string {
  if (status === "success") return "Berhasil";
  if (status === "partial") return "Sebagian berhasil";
  if (status === "failed") return "Gagal";
  if (status === "running") return "Sedang berjalan";
  return status;
}

function statusClass(status: string): string {
  if (status === "success") return "status-success";
  if (status === "partial") return "status-partial";
  if (status === "failed") return "status-failed";
  return "status-running";
}

function durationLabel(log: SyncLogRow): string {
  if (!log.completed_at) return "Sedang berjalan";
  const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  return `${(ms / 1000).toFixed(1)} detik`;
}

function describeMessage(message: string | null): string {
  if (!message) return "Tidak ada catatan tambahan.";
  try {
    const parsed = JSON.parse(message) as {
      ordersSaved?: number;
      itemRowsSaved?: number;
      failedStages?: number;
      truncatedStages?: number;
      issues?: { stage: string; error?: string; truncated?: boolean }[];
    };
    if (parsed && typeof parsed === "object" && ("ordersSaved" in parsed || "issues" in parsed)) {
      const parts = [
        `${formatNumber(parsed.ordersSaved ?? 0)} order disimpan`,
        `${formatNumber(parsed.itemRowsSaved ?? 0)} baris item`,
      ];
      const failedIssues = (parsed.issues ?? []).filter((issue) => issue.error);
      const truncatedIssues = (parsed.issues ?? []).filter((issue) => issue.truncated);
      if (failedIssues.length) {
        const stageNames = failedIssues.map((issue) => issue.stage).join(", ");
        parts.push(`${failedIssues.length} tahap gagal (${stageNames})`);
      }
      if (truncatedIssues.length) {
        const stageNames = truncatedIssues.map((issue) => issue.stage).join(", ");
        parts.push(`${truncatedIssues.length} tahap belum tuntas dibaca (${stageNames})`);
      }
      return parts.join(" • ");
    }
    return message;
  } catch {
    return message;
  }
}

function BackfillCard({ label, state }: { label: string; state: SyncStateRow | undefined }) {
  if (!state) {
    return (
      <article>
        <span>{label}</span>
        <strong className="muted">Belum ada data</strong>
      </article>
    );
  }
  const processed = Math.min(state.next_page, state.total_count);
  const percent = state.total_count > 0 ? Math.min(100, (processed / state.total_count) * 100) : 0;
  return (
    <article className={state.completed ? "" : percent < 50 ? "critical" : "high"}>
      <span>{label}</span>
      <strong>{percent.toFixed(1)}%</strong>
      <small>
        {state.completed
          ? `Selesai • ${formatNumber(state.total_count)} baris`
          : `${formatNumber(processed)} dari ${formatNumber(state.total_count)} baris`}
      </small>
    </article>
  );
}

export function SyncHealthView({ enabled, onRefreshFromJubelio, refreshing }: Props) {
  const health = useSyncHealth(enabled);
  const { data } = health;

  const latestBySource = useMemo(() => {
    const map = new Map<string, SyncLogRow>();
    for (const log of data.logs) {
      if (!map.has(log.sync_type)) map.set(log.sync_type, log);
    }
    return map;
  }, [data.logs]);

  const stateByType = useMemo(() => {
    const map = new Map<string, SyncStateRow>();
    for (const row of data.state) map.set(row.sync_type, row);
    return map;
  }, [data.state]);

  const knownSources = Array.from(new Set([...SOURCE_ORDER, ...latestBySource.keys()]));
  const failingSources = knownSources.filter((source) => {
    const log = latestBySource.get(source);
    return log && (log.status === "failed" || log.status === "partial");
  });

  return (
    <>
      <section className="forecast-intro panel">
        <div>
          <p className="eyebrow">KESEHATAN SINKRONISASI</p>
          <h2>Status sinkronisasi Jubelio → Supabase</h2>
          <p>
            Waktu sinkron terakhir, status jujur (berhasil/sebagian/gagal), dan progres backfill
            per sumber data. Data lama tetap ditampilkan jika pemuatan gagal.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={refreshing}
          onClick={() => {
            void onRefreshFromJubelio().then(() => void health.reload());
          }}
        >
          <RefreshCw className={refreshing ? "spin" : ""} size={17} />
          {refreshing ? "Menyinkronkan…" : "Refresh order & stok sekarang"}
        </button>
      </section>

      {failingSources.length > 0 && (
        <div className="coverage-banner" role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>{failingSources.length} sumber belum sinkron sepenuhnya pada run terakhir</strong>
            <p>
              {failingSources.map((source) => sourceLabel(source)).join(", ")}. Lihat detail tahap
              yang gagal pada kartu dan tabel riwayat di bawah.
            </p>
          </div>
        </div>
      )}

      {health.error && (
        <div className="error-banner">
          <AlertTriangle size={19} />
          <span>{health.error}</span>
          <button onClick={() => void health.reload()}>Coba lagi</button>
        </div>
      )}

      <section className="forecast-stat-grid">
        {knownSources.map((source) => {
          const log = latestBySource.get(source);
          const state = stateByType.get(source);
          // Backfill workers stop writing to sync_logs once sync_state.completed
          // is true (they short-circuit before logging), so a finished backfill
          // can look "never synced" if its last log fell out of the recent window.
          const finishedBackfillWithNoRecentLog = !log && state?.completed;
          return (
            <article key={source} className={log?.status === "failed" ? "critical" : log?.status === "partial" ? "high" : undefined}>
              <span>{sourceLabel(source)}</span>
              {log ? (
                <>
                  <span className={`status-pill ${statusClass(log.status)}`}>{statusLabel(log.status)}</span>
                  <small>Terakhir: {formatDateTime(log.started_at)}</small>
                </>
              ) : finishedBackfillWithNoRecentLog ? (
                <>
                  <span className="status-pill status-success">Selesai</span>
                  <small>Rampung: {formatDateTime(state.updated_at)}</small>
                </>
              ) : (
                <span className="muted">Belum pernah sinkron</span>
              )}
            </article>
          );
        })}
      </section>

      <div className="metric-group-heading"><span>Progres backfill histori</span></div>
      <section className="forecast-stat-grid">
        <BackfillCard label="Histori order selesai" state={stateByType.get("completed_orders_backfill")} />
        <BackfillCard label="Detail item order (forecast)" state={stateByType.get("forecast_order_items_backfill")} />
      </section>

      <article className="panel table-panel">
        <div className="table-toolbar">
          <strong>Riwayat sinkronisasi terbaru</strong>
          <span className="panel-meta">{data.logs.length} catatan terakhir</span>
        </div>
        {health.loading && !data.logs.length ? (
          <div className="forecast-loading"><LoaderCircle className="spin" size={28} /><strong>Memuat riwayat sinkronisasi…</strong></div>
        ) : data.logs.length ? (
          <div className="table-scroll">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Sumber</th>
                  <th>Status</th>
                  <th>Mulai</th>
                  <th>Durasi</th>
                  <th>Baris diproses</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td>{sourceLabel(log.sync_type)}</td>
                    <td><span className={`status-pill ${statusClass(log.status)}`}>{statusLabel(log.status)}</span></td>
                    <td>{formatDateTime(log.started_at)}</td>
                    <td>{durationLabel(log)}</td>
                    <td>{formatNumber(log.records_processed)}</td>
                    <td className="reason-cell">{describeMessage(log.message)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><Boxes size={28} /><strong>Belum ada riwayat sinkronisasi</strong><p>Riwayat akan muncul setelah sinkronisasi pertama berjalan.</p></div>
        )}
      </article>
    </>
  );
}
