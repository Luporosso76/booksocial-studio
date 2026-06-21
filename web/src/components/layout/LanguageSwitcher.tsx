import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { cn } from "@/lib/cn";

/**
 * Selettore lingua (IT / EN) per l'header. Cambia la lingua attiva via
 * i18n.changeLanguage e la persiste in localStorage (gestito dal detector).
 */
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const active = (i18n.resolvedLanguage ?? i18n.language ?? "it").slice(0, 2) as SupportedLanguage;

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="inline-flex items-center gap-0.5 rounded-md border border-border-subtle bg-bg-raised p-0.5"
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const isActive = lng === active;
        return (
          <button
            key={lng}
            type="button"
            aria-pressed={isActive}
            onClick={() => void i18n.changeLanguage(lng)}
            className={cn(
              "rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide transition-colors duration-150 ease-out-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
              isActive
                ? "bg-accent-soft text-accent"
                : "text-content-tertiary hover:bg-bg-hover hover:text-content-primary",
            )}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}
