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
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { authLogout } from "@/api/endpoints";

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

function SidebarLink({ to, labelKey, icon: Icon, onNavigate }: NavItem & { onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
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
              isActive ? "text-accent" : "text-content-tertiary group-hover:text-content-secondary",
            )}
          />
          <span aria-current={isActive ? "page" : undefined}>{t(labelKey)}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-raised transition-transform duration-200 ease-out-strong md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
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
          <SidebarLink key={item.to} {...item} onNavigate={onClose} />
        ))}

        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="mb-1 px-3 text-2xs font-medium uppercase tracking-wide text-content-faint">
            {t("nav.settingsGroup")}
          </div>
          {SETTINGS.map((item) => (
            <SidebarLink key={item.to} {...item} onNavigate={onClose} />
          ))}
        </div>
      </nav>

      <div className="border-t border-border-subtle p-3">
        <button
          type="button"
          onClick={async () => {
            try {
              await authLogout();
            } finally {
              window.location.reload();
            }
          }}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-content-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-content-primary"
        >
          <LogOut className="h-[1.05rem] w-[1.05rem] shrink-0 text-content-tertiary group-hover:text-content-secondary" />
          <span>{t("auth.logout")}</span>
        </button>
        <div className="px-3 pt-2 text-2xs text-content-faint">{t("nav.localNote")}</div>
      </div>
    </aside>
    </>
  );
}
