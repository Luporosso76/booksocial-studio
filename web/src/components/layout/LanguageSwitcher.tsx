import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";

// Bandiera e nome nativo per lingua (gli endonimi non vanno tradotti: restano uguali in ogni UI).
const FLAG: Record<SupportedLanguage, string> = {
  it: "🇮🇹",
  en: "🇬🇧",
  fr: "🇫🇷",
  es: "🇪🇸",
  de: "🇩🇪",
};
const NAME: Record<SupportedLanguage, string> = {
  it: "Italiano",
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
};

/**
 * Selettore lingua a tendina con bandiera + nome nativo. Cambia la lingua attiva via
 * i18n.changeLanguage e la persiste in localStorage (detector).
 */
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const raw = (i18n.resolvedLanguage ?? i18n.language ?? "en").slice(0, 2);
  const active = (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)
    ? (raw as SupportedLanguage)
    : "en";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("language.label")}
        className="inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-raised px-3 py-1.5 text-sm text-content-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      >
        <span className="text-base leading-none">{FLAG[active]}</span>
        <span className="font-medium">{NAME[active]}</span>
        <ChevronDown className="h-4 w-4 text-content-tertiary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem key={lng} onSelect={() => void i18n.changeLanguage(lng)}>
            <span className="text-base leading-none">{FLAG[lng]}</span>
            <span className="flex-1">{NAME[lng]}</span>
            {lng === active && <Check className="h-4 w-4 text-accent" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
