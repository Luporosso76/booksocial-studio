import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyRound,
  Link2,
  Trash2,
  Unplug,
  CheckSquare,
  Square,
  Plug,
  Settings2,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { useStatus } from "@/lib/status";
import {
  disconnectAll,
  fetchManagedPages,
  getPages,
  removePage,
  saveConnection,
} from "@/api/endpoints";
import type { FacebookPage, ManagedPage } from "@/api/types";
import { cn } from "@/lib/cn";
import { PageSettingsEditor } from "@/components/PageSettingsEditor";

export function ConnectionScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { refresh: refreshStatus } = useStatus();
  const pagesState = useAsync<FacebookPage[]>((s) => getPages(s), []);

  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [discovered, setDiscovered] = useState<ManagedPage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [managingPage, setManagingPage] = useState<FacebookPage | null>(null);

  async function handleConnect() {
    if (!token.trim()) {
      toast.error(t("connection.tokenRequired"));
      return;
    }
    setConnecting(true);
    try {
      const pages = await fetchManagedPages(token.trim());
      setDiscovered(pages);
      setSelected(new Set(pages.map((p) => p.id)));
      if (pages.length === 0) {
        toast.info(t("connection.noPagesFound"));
      } else {
        toast.success(t("connection.pagesFound", { count: pages.length }));
      }
    } catch (err) {
      toast.error(errorMessage(err) || t("connection.connectFailed"));
    } finally {
      setConnecting(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!discovered) return;
    const chosen = discovered.filter((p) => selected.has(p.id));
    if (chosen.length === 0) {
      toast.error(t("connection.selectAtLeastOne"));
      return;
    }
    setSaving(true);
    try {
      const res = await saveConnection(chosen);
      toast.success(t("connection.saved", { count: res.saved }));
      setDiscovered(null);
      setSelected(new Set());
      setToken("");
      pagesState.reload();
      refreshStatus();
    } catch (err) {
      toast.error(errorMessage(err) || t("connection.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setRemoving(id);
    try {
      await removePage(id);
      toast.success(t("connection.pageRemoved"));
      pagesState.reload();
      refreshStatus();
    } catch (err) {
      toast.error(errorMessage(err) || t("connection.removeFailed"));
    } finally {
      setRemoving(null);
    }
  }

  async function handleDisconnectAll() {
    try {
      await disconnectAll();
      toast.success(t("connection.allDisconnected"));
      setConfirmDisconnect(false);
      pagesState.reload();
      refreshStatus();
    } catch (err) {
      toast.error(errorMessage(err) || t("connection.operationFailed"));
    }
  }

  const connected = pagesState.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t("connection.connectTitle")}
          description={t("connection.connectDescription")}
        />
        <CardBody className="flex flex-col gap-4">
          <Field label={t("connection.tokenLabel")} hint={t("connection.tokenHint")}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-faint" />
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="EAAB..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnect();
                  }}
                  className="pl-9 font-mono"
                />
              </div>
              <Button variant="primary" onClick={handleConnect} loading={connecting}>
                <Plug className="h-4 w-4" />
                {t("connection.connect")}
              </Button>
            </div>
          </Field>

          {discovered && (
            <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-inset p-4 animate-slide-up-in">
              <div className="flex items-center justify-between">
                <span className="text-[0.8125rem] font-medium text-content-secondary">
                  {t("connection.availablePages")}
                </span>
                <span className="text-xs text-content-tertiary">
                  {t("connection.selectedCount", {
                    selected: selected.size,
                    total: discovered.length,
                  })}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 stagger">
                {discovered.map((p) => {
                  const isOn = selected.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
                        "transition-[background-color,border-color,transform] duration-150 ease-out-strong active:scale-[0.99]",
                        isOn
                          ? "border-accent/40 bg-accent-soft"
                          : "border-border bg-bg-card hover:bg-bg-hover",
                      )}
                    >
                      {isOn ? (
                        <CheckSquare className="h-4 w-4 shrink-0 text-accent" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0 text-content-faint" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-content-primary">
                          {p.name}
                        </div>
                        {p.category && (
                          <div className="truncate text-xs text-content-tertiary">{p.category}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setDiscovered(null)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  {t("connection.saveSelection")}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("connection.connectedTitle")}
          description={t("connection.connectedDescription")}
          action={
            connected.length > 0 ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmDisconnect(true)}>
                <Unplug className="h-4 w-4" />
                {t("connection.disconnectAll")}
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {pagesState.loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : pagesState.error ? (
            <ErrorBanner message={pagesState.error} onRetry={pagesState.reload} />
          ) : connected.length === 0 ? (
            <EmptyState
              icon={<Link2 className="h-5 w-5" />}
              title={t("connection.noPagesTitle")}
              description={t("connection.noPagesDescription")}
            />
          ) : (
            <div className="flex flex-col gap-2 stagger">
              {connected.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-inset px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-content-primary">
                        {p.name}
                      </span>
                      <Badge tone="success">{t("connection.connected")}</Badge>
                    </div>
                    {p.category && (
                      <div className="truncate text-xs text-content-tertiary">{p.category}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManagingPage(p)}
                      aria-label={t("connection.manageAria", { name: p.name })}
                    >
                      <Settings2 className="h-4 w-4" />
                      <span className="hidden sm:inline">{t("connection.managePage")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={removing === p.id}
                      onClick={() => handleRemove(p.id)}
                      aria-label={t("connection.removeAria", { name: p.name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title={t("connection.disconnectTitle")}
        description={t("connection.disconnectDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDisconnect(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDisconnectAll}>
              {t("connection.disconnectAll")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">{t("connection.disconnectBody")}</p>
      </Modal>

      {managingPage && (
        <Modal
          open={managingPage !== null}
          onClose={() => setManagingPage(null)}
          title={t("connection.settingsTitle")}
          description={managingPage.name}
          size="lg"
        >
          <PageSettingsEditor pageId={managingPage.pageId ?? managingPage.id} />
        </Modal>
      )}
    </div>
  );
}
