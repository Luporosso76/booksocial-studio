import { Hash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

function TagRow({
  label,
  tags,
  tone,
}: {
  label: string;
  tags: string[];
  tone: "base" | "specific" | "final";
}) {
  if (tags.length === 0) return null;
  const toneClass =
    tone === "base"
      ? "border-accent/30 bg-accent-soft text-accent"
      : tone === "specific"
        ? "border-success/30 bg-success/10 text-success"
        : "border-border bg-bg-hover text-content-secondary";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-wide text-content-faint">
        {label}
      </span>
      {tags.map((t) => (
        <span
          key={t}
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-medium",
            toneClass,
          )}
        >
          {t.startsWith("#") ? t : `#${t}`}
        </span>
      ))}
    </div>
  );
}

export function HashtagBreakdown({
  base,
  specific,
  final,
}: {
  base?: string[];
  specific?: string[];
  final?: string[];
}) {
  const { t } = useTranslation();
  const b = base ?? [];
  const s = specific ?? [];
  const f = final ?? [];
  if (b.length === 0 && s.length === 0 && f.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
      <div className="flex items-center gap-1.5 text-2xs font-medium text-content-tertiary">
        <Hash className="h-3 w-3" />
        {t("dashboard.hashtagsTitle")}
      </div>
      <TagRow label={t("dashboard.hashtagsBase")} tags={b} tone="base" />
      <TagRow label={t("dashboard.hashtagsSpecific")} tags={s} tone="specific" />
      {f.length > 0 && <TagRow label={t("dashboard.hashtagsFinal")} tags={f} tone="final" />}
    </div>
  );
}
