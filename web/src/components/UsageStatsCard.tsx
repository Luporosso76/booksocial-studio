import { BarChart3, ImageIcon, Quote } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useAsync } from "@/lib/useAsync";
import { contentVisualKindLabel, textModeLabel } from "@/lib/labels";
import { getUsageStats } from "@/api/endpoints";
import type { UsageStats } from "@/api/types";

// ---------------------------------------------------------------------------
// Statistiche d'uso: distribuzione dei contenuti generati per formato/visualKind,
// modalità di testo e proporzione, più immagini/citazioni meno usate. Stesso
// stile dei widget esistenti; stato vuoto sensato quando non c'è ancora storico.
// ---------------------------------------------------------------------------

// Barra di distribuzione: una riga per chiave con conteggio e barra proporzionale.
function DistributionBars({
  title,
  data,
  labelFn,
}: {
  title: string;
  data: Record<string, number>;
  labelFn?: (key: string) => string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-medium uppercase tracking-wide text-content-faint">
        {title}
      </span>
      {entries.length === 0 ? (
        <p className="text-xs text-content-tertiary">Nessun dato.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-xs text-content-secondary">
                {labelFn ? labelFn(key) : key}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-hover">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: max > 0 ? `${(value / max) * 100}%` : "0%" }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-semibold text-content-primary">
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UsageStatsCard({ pageId }: { pageId: string }) {
  const state = useAsync<UsageStats>((s) => getUsageStats(pageId, s), [pageId]);

  const stats = state.data;
  const isEmpty = !stats || stats.totalContents === 0;

  return (
    <Card>
      <CardHeader
        title="Statistiche d'uso"
        description="Come si distribuiscono i contenuti generati per formato, testo e proporzione."
        action={stats ? <Badge tone="neutral">{stats.totalContents} contenuti</Badge> : undefined}
      />
      <CardBody>
        {state.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : isEmpty ? (
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="Ancora nessun contenuto"
            description="Genera qualche bozza dal Pianificatore per vedere qui la distribuzione dei formati."
          />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <DistributionBars
                title="Tipo di visual"
                data={stats!.byVisualKind}
                labelFn={contentVisualKindLabel}
              />
              <DistributionBars
                title="Modalità testo"
                data={stats!.byTextMode}
                labelFn={textModeLabel}
              />
              <DistributionBars title="Proporzione" data={stats!.byAspect} />
            </div>

            {/* Immagini e citazioni meno usate: suggerimenti per variare i contenuti. */}
            <div className="grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-content-faint">
                  <ImageIcon className="h-3 w-3" />
                  Immagini poco usate
                </span>
                {stats!.leastUsedImageIds.length === 0 ? (
                  <p className="text-xs text-content-tertiary">Nessuna immagine disponibile.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {stats!.leastUsedImageIds.slice(0, 12).map((id) => (
                      <Badge key={id} tone="neutral">
                        #{id}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-content-faint">
                  <Quote className="h-3 w-3" />
                  Citazioni recenti
                </span>
                {stats!.recentQuoteKeys.length === 0 ? (
                  <p className="text-xs text-content-tertiary">Nessuna citazione recente.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {stats!.recentQuoteKeys.slice(0, 8).map((q) => (
                      <Badge key={q} tone="neutral">
                        {q}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
