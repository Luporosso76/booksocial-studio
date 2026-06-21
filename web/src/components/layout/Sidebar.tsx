import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PlugZap,
  Library,
  CalendarClock,
  CalendarCheck,
  LayoutDashboard,
  BarChart3,
  BookOpen,
  FileCog,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/pianificatore", labelKey: "nav.planner", icon: CalendarClock },
  { to: "/programmati", labelKey: "nav.scheduled", icon: CalendarCheck },
  { to: "/insight", labelKey: "nav.insights", icon: BarChart3 },
];

const SETTINGS: NavItem[] = [
  { to: "/connessione", labelKey: "nav.connection", icon: PlugZap },
  { to: "/gestione", labelKey: "nav.pageManagement", icon: FileCog },
  { to: "/libri", labelKey: "nav.books", icon: Library },
  { to: "/impostazioni", labelKey: "nav.settings", icon: Settings },
];

function SidebarLink({ to, labelKey, icon: Icon }: NavItem) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
          "transition-[background-color,color,transform] duration-150 ease-out-strong active:scale-[0.98]",
          isActive
            ? "border-l-2 border-accent bg-accent-soft pl-[calc(0.75rem-2px)] text-accent"
            : "text-content-secondary hover:bg-bg-hover hover:text-content-primary",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-[1.05rem] w-[1.05rem] shrink-0 transition-colors",
              isActive
                ? "text-accent"
                : "text-content-tertiary group-hover:text-content-secondary",
            )}
          />
          <span aria-current={isActive ? "page" : undefined}>{t(labelKey)}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-raised">
      <div className="flex h-14 items-center gap-2.5 border-b border-border-subtle px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-accent-glow">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-content-primary">{t("nav.brand")}</div>
          <div className="text-2xs font-medium uppercase tracking-wide text-content-faint">
            {t("nav.brandSub")}
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {PRIMARY.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}

        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="mb-1 px-3 text-2xs font-medium uppercase tracking-wide text-content-faint">
            {t("nav.settingsGroup")}
          </div>
          {SETTINGS.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <div className="border-t border-border-subtle px-5 py-3 text-2xs text-content-faint">
        {t("nav.localNote")}
      </div>
    </aside>
  );
}
