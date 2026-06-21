import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Images,
  KeyRound,
  LogIn,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { Input, Field, selectClass } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast";
import { useAsync, errorMessage } from "@/lib/useAsync";
import {
  getAiImageMode,
  setAiImageMode,
  getQaCheck,
  setQaCheck,
  getAiSettings,
  updateAiSettings,
  testAiText,
  testAiImage,
  listAiModels,
  getCliStatus,
  cliLogin,
  type AiTestResult,
} from "@/api/endpoints";
import type {
  AiImageMode,
  AiImageModeState,
  AiImageProvider,
  AiSettings,
  AiSettingsPatch,
  AiTextProvider,
  CliLoginResponse,
  CliStatus,
} from "@/api/types";
import { cn } from "@/lib/cn";

export function ImpostazioniScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-content-primary">{t("settings.title")}</h2>
        <p className="mt-0.5 text-sm text-content-tertiary">{t("settings.subtitle")}</p>
      </div>

      <AiProvidersCard />
      <AiImageModeCard />
      <QaCheckCard />
    </div>
  );
}

// Provider testo ad ABBONAMENTO (login via CLI, nessuna chiave API).
const CLI_TEXT_PROVIDERS = ["opencode", "codex", "gemini"] as const;
type CliTextProvider = (typeof CLI_TEXT_PROVIDERS)[number];

// Provider testo ad API a consumo (chiave API).
const API_TEXT_PROVIDERS: AiTextProvider[] = [
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
  "ollama",
];

function isCliTextProvider(p: AiTextProvider): p is CliTextProvider {
  return (CLI_TEXT_PROVIDERS as readonly string[]).includes(p);
}

// Mappa provider CLI → campo modello (string) da salvare nel patch text.*.
type CliModelField = "opencodeModel" | "codexModel" | "geminiModel";
const CLI_MODEL_FIELD: Record<CliTextProvider, CliModelField> = {
  opencode: "opencodeModel",
  codex: "codexModel",
  gemini: "geminiModel",
};

const IMAGE_PROVIDERS: AiImageProvider[] = [
  "auto",
  "local",
  "openai",
  "google",
  "stability",
  "bfl",
  "replicate",
  "fal",
  "none",
];

// Quale provider testo usa quale "famiglia" di chiave (per badge + invio chiavi).
type KeyName = "openai" | "anthropic" | "google" | "stability" | "bfl" | "replicate" | "fal";

const ALL_KEY_NAMES: KeyName[] = [
  "openai",
  "anthropic",
  "google",
  "stability",
  "bfl",
  "replicate",
  "fal",
];

function AiProvidersCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const state = useAsync<AiSettings>((s) => getAiSettings(s), []);

  // Bozza locale dei campi (testo + immagini). Le chiavi sono gestite a parte.
  const [text, setText] = useState<AiSettings["text"] | null>(null);
  const [image, setImage] = useState<AiSettings["image"] | null>(null);
  // Input chiavi: '' = invariata. Tracciamo separatamente quali sono state "rimosse".
  const emptyKeyRecord = (): Record<KeyName, string> => ({
    openai: "",
    anthropic: "",
    google: "",
    stability: "",
    bfl: "",
    replicate: "",
    fal: "",
  });
  const emptyRemovedRecord = (): Record<KeyName, boolean> => ({
    openai: false,
    anthropic: false,
    google: false,
    stability: false,
    bfl: false,
    replicate: false,
    fal: false,
  });
  const [keyInputs, setKeyInputs] = useState<Record<KeyName, string>>(emptyKeyRecord);
  const [removedKeys, setRemovedKeys] = useState<Record<KeyName, boolean>>(emptyRemovedRecord);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.data) {
      setText(state.data.text);
      setImage(state.data.image);
      setKeyInputs(emptyKeyRecord());
      setRemovedKeys(emptyRemovedRecord());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);

  function setTextField<K extends keyof AiSettings["text"]>(key: K, value: AiSettings["text"][K]) {
    setText((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  function setImageField<K extends keyof AiSettings["image"]>(
    key: K,
    value: AiSettings["image"][K],
  ) {
    setImage((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function onKeyInput(name: KeyName, value: string) {
    setKeyInputs((prev) => ({ ...prev, [name]: value }));
    if (value) setRemovedKeys((prev) => ({ ...prev, [name]: false }));
  }
  function removeKey(name: KeyName) {
    setRemovedKeys((prev) => ({ ...prev, [name]: true }));
    setKeyInputs((prev) => ({ ...prev, [name]: "" }));
  }

  async function save() {
    if (!text || !image) return;
    const patch: AiSettingsPatch = { text, image };
    const keys: NonNullable<AiSettingsPatch["keys"]> = {};
    ALL_KEY_NAMES.forEach((name) => {
      if (keyInputs[name]) keys[name] = keyInputs[name];
      else if (removedKeys[name]) keys[name] = null;
    });
    if (Object.keys(keys).length) patch.keys = keys;

    setSaving(true);
    try {
      await updateAiSettings(patch);
      toast.success(t("settings.ai.saved"));
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err) || t("settings.ai.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Stato "configurata" effettivo per i badge: parte dal backend, ma riflette le modifiche locali.
  function keyConfigured(name: KeyName): boolean {
    if (keyInputs[name]) return true;
    if (removedKeys[name]) return false;
    return state.data?.keys[name] ?? false;
  }

  return (
    <Card>
      <CardHeader
        title={t("settings.ai.title")}
        description={t("settings.ai.description")}
        action={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Sparkles className="h-4 w-4" />
          </span>
        }
      />
      <CardBody className="flex flex-col gap-5">
        {state.loading ? (
          <Skeleton className="h-64 w-full" />
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : text && image ? (
          <>
            {/* --- Provider TESTO --- */}
            <section className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-content-primary">
                {t("settings.ai.textSection")}
              </h4>
              <Field label={t("settings.ai.provider")}>
                <select
                  className={selectClass}
                  value={text.provider}
                  onChange={(e) => setTextField("provider", e.target.value as AiTextProvider)}
                >
                  <optgroup label={t("settings.ai.textGroupCli")}>
                    {CLI_TEXT_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {t(`settings.ai.textProvider.${p}`)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("settings.ai.textGroupApi")}>
                    {API_TEXT_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {t(`settings.ai.textProvider.${p}`)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>

              {(text.provider === "openai" || text.provider === "openai-compatible") && (
                <>
                  <Field label={t("settings.ai.baseUrl")}>
                    <Input
                      value={text.openaiBaseUrl}
                      onChange={(e) => setTextField("openaiBaseUrl", e.target.value)}
                      placeholder="https://api.openai.com/v1"
                    />
                  </Field>
                  <ModelSelectField
                    provider={text.provider}
                    value={text.openaiModel}
                    onChange={(v) => setTextField("openaiModel", v)}
                    apiKey={keyInputs.openai}
                    baseUrl={text.openaiBaseUrl}
                    keyConfigured={keyConfigured("openai")}
                  />
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("openai")}
                    value={keyInputs.openai}
                    onChange={(v) => onKeyInput("openai", v)}
                    onRemove={() => removeKey("openai")}
                  />
                </>
              )}

              {text.provider === "anthropic" && (
                <>
                  <ModelSelectField
                    provider={text.provider}
                    value={text.anthropicModel}
                    onChange={(v) => setTextField("anthropicModel", v)}
                    apiKey={keyInputs.anthropic}
                    keyConfigured={keyConfigured("anthropic")}
                  />
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("anthropic")}
                    value={keyInputs.anthropic}
                    onChange={(v) => onKeyInput("anthropic", v)}
                    onRemove={() => removeKey("anthropic")}
                  />
                </>
              )}

              {text.provider === "google" && (
                <>
                  <Field label={t("settings.ai.baseUrl")}>
                    <Input
                      value={text.googleBaseUrl}
                      onChange={(e) => setTextField("googleBaseUrl", e.target.value)}
                    />
                  </Field>
                  <ModelSelectField
                    provider={text.provider}
                    value={text.googleModel}
                    onChange={(v) => setTextField("googleModel", v)}
                    apiKey={keyInputs.google}
                    baseUrl={text.googleBaseUrl}
                    keyConfigured={keyConfigured("google")}
                  />
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("google")}
                    value={keyInputs.google}
                    onChange={(v) => onKeyInput("google", v)}
                    onRemove={() => removeKey("google")}
                  />
                </>
              )}

              {text.provider === "ollama" && (
                <>
                  <Field label={t("settings.ai.baseUrl")}>
                    <Input
                      value={text.ollamaBaseUrl}
                      onChange={(e) => setTextField("ollamaBaseUrl", e.target.value)}
                      placeholder="http://127.0.0.1:11434"
                    />
                  </Field>
                  <ModelSelectField
                    provider={text.provider}
                    value={text.ollamaModel}
                    onChange={(v) => setTextField("ollamaModel", v)}
                    baseUrl={text.ollamaBaseUrl}
                    keyConfigured={false}
                  />
                </>
              )}

              {isCliTextProvider(text.provider) &&
                (() => {
                  const field = CLI_MODEL_FIELD[text.provider as CliTextProvider];
                  return (
                    <CliProviderSection
                      tool={text.provider}
                      model={text[field]}
                      onModelChange={(v) => setTextField(field, v)}
                    />
                  );
                })()}

              <TestConnectionButton run={testAiText} />
            </section>

            {/* --- Provider IMMAGINI --- */}
            <section className="flex flex-col gap-3 border-t border-border-subtle pt-4">
              <h4 className="text-sm font-semibold text-content-primary">
                {t("settings.ai.imageSection")}
              </h4>
              <Field label={t("settings.ai.provider")}>
                <select
                  className={selectClass}
                  value={image.provider}
                  onChange={(e) => setImageField("provider", e.target.value as AiImageProvider)}
                >
                  {IMAGE_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {t(`settings.ai.imageProvider.${p}`)}
                    </option>
                  ))}
                </select>
              </Field>

              {image.provider === "openai" && (
                <>
                  <Field
                    label={t("settings.ai.imageModel")}
                    hint={t("settings.ai.sharedOpenaiKey")}
                  >
                    <Input
                      value={image.openaiImageModel}
                      onChange={(e) => setImageField("openaiImageModel", e.target.value)}
                      placeholder={t("settings.ai.imageModelPlaceholder")}
                    />
                  </Field>
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("openai")}
                    value={keyInputs.openai}
                    onChange={(v) => onKeyInput("openai", v)}
                    onRemove={() => removeKey("openai")}
                  />
                </>
              )}
              {image.provider === "google" && (
                <>
                  <Field
                    label={t("settings.ai.imageModel")}
                    hint={t("settings.ai.sharedGoogleKey")}
                  >
                    <Input
                      value={image.googleImageModel}
                      onChange={(e) => setImageField("googleImageModel", e.target.value)}
                      placeholder={t("settings.ai.imageModelPlaceholder")}
                    />
                  </Field>
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("google")}
                    value={keyInputs.google}
                    onChange={(v) => onKeyInput("google", v)}
                    onRemove={() => removeKey("google")}
                  />
                </>
              )}
              {image.provider === "stability" && (
                <>
                  <Field label={t("settings.ai.imageModel")} hint={t("settings.ai.imageModelHint")}>
                    <Input
                      value={image.stabilityImageModel}
                      onChange={(e) => setImageField("stabilityImageModel", e.target.value)}
                      placeholder={t("settings.ai.imageModelPlaceholder")}
                    />
                  </Field>
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("stability")}
                    value={keyInputs.stability}
                    onChange={(v) => onKeyInput("stability", v)}
                    onRemove={() => removeKey("stability")}
                  />
                </>
              )}
              {image.provider === "bfl" && (
                <>
                  <Field label={t("settings.ai.imageModel")} hint={t("settings.ai.imageModelHint")}>
                    <Input
                      value={image.bflImageModel}
                      onChange={(e) => setImageField("bflImageModel", e.target.value)}
                      placeholder={t("settings.ai.imageModelPlaceholder")}
                    />
                  </Field>
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("bfl")}
                    value={keyInputs.bfl}
                    onChange={(v) => onKeyInput("bfl", v)}
                    onRemove={() => removeKey("bfl")}
                  />
                </>
              )}
              {image.provider === "replicate" && (
                <>
                  <Field label={t("settings.ai.imageModel")}>
                    <Input
                      value={image.replicateImageModel}
                      onChange={(e) => setImageField("replicateImageModel", e.target.value)}
                      placeholder="black-forest-labs/flux-schnell"
                    />
                  </Field>
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("replicate")}
                    value={keyInputs.replicate}
                    onChange={(v) => onKeyInput("replicate", v)}
                    onRemove={() => removeKey("replicate")}
                  />
                </>
              )}
              {image.provider === "fal" && (
                <>
                  <Field label={t("settings.ai.imageModel")}>
                    <Input
                      value={image.falImageModel}
                      onChange={(e) => setImageField("falImageModel", e.target.value)}
                      placeholder="fal-ai/flux/schnell"
                    />
                  </Field>
                  <ApiKeyField
                    label={t("settings.ai.apiKey")}
                    configured={keyConfigured("fal")}
                    value={keyInputs.fal}
                    onChange={(v) => onKeyInput("fal", v)}
                    onRemove={() => removeKey("fal")}
                  />
                </>
              )}
              {(image.provider === "local" || image.provider === "auto") && (
                <p className="text-xs leading-snug text-content-tertiary">
                  {t("settings.ai.localImageNote")}
                </p>
              )}

              <TestConnectionButton run={testAiImage} />
            </section>

            <div className="flex justify-end border-t border-border-subtle pt-4">
              <Button variant="primary" loading={saving} disabled={saving} onClick={save}>
                {t("common.save")}
              </Button>
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ApiKeyField({
  label,
  configured,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  configured: boolean;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Field
      label={
        <span className="flex items-center gap-2">
          {label}
          {configured && (
            <Badge tone="success">
              <Check className="h-3 w-3" />
              {t("settings.ai.keyConfigured")}
            </Badge>
          )}
        </span>
      }
      hint={t("settings.ai.keyHint")}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-faint" />
          <Input
            type="password"
            autoComplete="off"
            className="pl-8"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={configured ? "••••••••" : ""}
          />
        </span>
        {configured && (
          <Button variant="danger" size="sm" type="button" onClick={onRemove}>
            {t("settings.ai.removeKey")}
          </Button>
        )}
      </div>
    </Field>
  );
}

// Campo modello con SELECT popolata da listAiModels + fallback manuale "Altro…".
// Carica automaticamente la lista quando la chiave risulta già presente (keyConfigured)
// o quando l'utente la digita; mantiene sempre il valore corrente.
const MANUAL_OPTION = "__manual__";
function ModelSelectField({
  provider,
  value,
  onChange,
  apiKey,
  baseUrl,
  keyConfigured,
}: {
  provider: AiTextProvider;
  value: string;
  onChange: (value: string) => void;
  apiKey?: string;
  baseUrl?: string;
  keyConfigured: boolean;
}) {
  const { t } = useTranslation();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true = l'utente ha scelto l'inserimento manuale (o la lista non contiene il valore).
  const [manual, setManual] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listAiModels(provider, apiKey || undefined, baseUrl || undefined);
      setModels(res.models);
      if (res.error) setError(res.error);
      if (!res.models.length) {
        setManual(true);
        setError(res.error || t("settings.ai.modelsEmpty"));
      } else if (value && !res.models.includes(value)) {
        setManual(true);
      }
    } catch {
      setError(t("settings.ai.modelsLoadFailed"));
      setManual(true);
    } finally {
      setLoading(false);
    }
  }

  // Carica automaticamente quando la chiave è già impostata o non serve (ollama).
  useEffect(() => {
    if (keyConfigured || provider === "ollama") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const hasList = models.length > 0;
  const selectValue = manual || !models.includes(value) ? MANUAL_OPTION : value;

  return (
    <Field label={t("settings.ai.modelSelect")}>
      <div className="flex flex-col gap-2">
        {hasList && (
          <select
            className={selectClass}
            value={selectValue}
            onChange={(e) => {
              if (e.target.value === MANUAL_OPTION) {
                setManual(true);
              } else {
                setManual(false);
                onChange(e.target.value);
              }
            }}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={MANUAL_OPTION}>{t("settings.ai.modelOther")}</option>
          </select>
        )}
        {(manual || !hasList) && (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("settings.ai.modelManual")}
          />
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            loading={loading}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? t("settings.ai.loadingModels") : t("settings.ai.loadModels")}
          </Button>
          {error && <span className="text-xs text-content-tertiary">{error}</span>}
        </div>
      </div>
    </Field>
  );
}

// Provider ad ABBONAMENTO (opencode/codex/gemini): stato CLI + login OAuth + verifica, senza
// chiave API. L'auth vive nel CLI; l'app non salva alcun token. Opzionale: nome modello del CLI.
function CliProviderSection({
  tool,
  model,
  onModelChange,
}: {
  tool: string;
  model: string;
  onModelChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState<CliLoginResponse | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  async function check() {
    setLoading(true);
    try {
      setStatus(await getCliStatus(tool));
    } catch {
      setStatus({ tool, installed: false, version: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLogin(null);
    getCliStatus(tool)
      .then((res) => {
        if (active) setStatus(res);
      })
      .catch(() => {
        if (active) setStatus({ tool, installed: false, version: null });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tool]);

  async function authenticate() {
    setAuthenticating(true);
    setLogin(null);
    try {
      setLogin(await cliLogin(tool));
    } catch (err) {
      setLogin({
        tool,
        started: false,
        error: errorMessage(err) || t("settings.ai.testFailed"),
      });
    } finally {
      setAuthenticating(false);
    }
  }

  return (
    <>
      <Field label={t("settings.ai.cliStatusTitle")} hint={t("settings.ai.cliAuthNote", { tool })}>
        {loading ? (
          <span className="text-xs text-content-tertiary">{t("settings.ai.cliChecking")}</span>
        ) : status?.installed ? (
          <span className="flex items-center gap-2 text-xs text-success">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>
              {t("settings.ai.cliInstalled")}
              {status.version
                ? ` — ${t("settings.ai.cliVersion", { version: status.version })}`
                : ""}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-xs text-danger">
            <X className="h-3.5 w-3.5 shrink-0" />
            <span>{t("settings.ai.cliNotFound")}</span>
          </span>
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          loading={authenticating}
          disabled={authenticating}
          onClick={() => void authenticate()}
        >
          <LogIn className="h-4 w-4" />
          {t("settings.ai.cliAuthenticate")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          loading={loading}
          disabled={loading}
          onClick={() => void check()}
        >
          {t("settings.ai.cliVerify")}
        </Button>
      </div>

      {login && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg-inset px-3 py-2.5 text-xs text-content-tertiary">
          {login.error ? (
            <span className="text-danger">{login.error}</span>
          ) : (
            <>
              {login.url ? (
                <a
                  href={login.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-accent underline"
                >
                  {t("settings.ai.cliOpenAndAuthorize")}
                </a>
              ) : login.output || login.hint ? (
                <span className="whitespace-pre-wrap break-words text-content-secondary">
                  {login.output || login.hint}
                </span>
              ) : null}
              <span>{t("settings.ai.cliLoginGuide")}</span>
            </>
          )}
        </div>
      )}

      <Field label={t("settings.ai.cliModelOptional")}>
        <Input
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={t("settings.ai.cliModelPlaceholder")}
        />
      </Field>
    </>
  );
}

// Pulsante "Prova connessione" riusabile (testo o immagini). Chiama `run`, mostra spinner e
// poi l'esito inline (✓ + anteprima/provider, oppure ✗ + errore). Stato locale, nessun toast.
function TestConnectionButton({ run }: { run: (signal?: AbortSignal) => Promise<AiTestResult> }) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);

  async function onTest() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await run());
    } catch (err) {
      setResult({
        ok: false,
        provider: "",
        error: errorMessage(err) || t("settings.ai.testFailed"),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        type="button"
        loading={testing}
        disabled={testing}
        onClick={onTest}
      >
        {!testing && <Plug className="h-4 w-4" />}
        {testing ? t("settings.ai.testing") : t("settings.ai.testConnection")}
      </Button>
      {result && (
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-xs",
            result.ok ? "text-success" : "text-danger",
          )}
        >
          {result.ok ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">
            {result.ok
              ? result.sample
                ? t("settings.ai.testOk", { sample: result.sample })
                : t("settings.ai.testOkProvider", { provider: result.provider })
              : `${t("settings.ai.testFailed")}${result.error ? `: ${result.error}` : ""}`}
          </span>
        </span>
      )}
    </div>
  );
}

const MODE_OPTIONS: {
  value: AiImageMode;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    value: "library",
    labelKey: "settings.imageMode.libraryLabel",
    descriptionKey: "settings.imageMode.libraryDescription",
  },
  {
    value: "direct",
    labelKey: "settings.imageMode.directLabel",
    descriptionKey: "settings.imageMode.directDescription",
  },
];

function AiImageModeCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const state = useAsync<AiImageModeState>((s) => getAiImageMode(s), []);

  const [mode, setMode] = useState<AiImageMode>("library");
  const [saving, setSaving] = useState<AiImageMode | null>(null);

  // Sincronizza la selezione locale con lo stato caricato dal backend.
  useEffect(() => {
    if (state.data) setMode(state.data.mode);
  }, [state.data]);

  const available = state.data?.available ?? false;

  async function select(next: AiImageMode) {
    if (next === mode) return;
    if (next === "direct" && !available) return;
    setSaving(next);
    const prev = mode;
    setMode(next);
    try {
      await setAiImageMode(next);
      toast.success(t("settings.imageMode.saved"));
    } catch (err) {
      setMode(prev);
      toast.error(errorMessage(err) || t("settings.imageMode.saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("settings.imageMode.title")}
        description={t("settings.imageMode.description")}
        action={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Images className="h-4 w-4" />
          </span>
        }
      />
      <CardBody className="flex flex-col gap-3">
        {state.loading ? (
          <Skeleton className="h-32 w-full" />
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {MODE_OPTIONS.map((opt) => {
                const isDirect = opt.value === "direct";
                const disabled = isDirect && !available;
                const isOn = mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled || saving !== null}
                    onClick={() => select(opt.value)}
                    aria-pressed={isOn}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3 text-left",
                      "transition-[background-color,border-color] duration-150 ease-out-strong",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      isOn
                        ? "border-accent/40 bg-accent-soft"
                        : "border-border-subtle bg-bg-inset hover:bg-bg-hover",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-content-primary">
                        {t(opt.labelKey)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-content-tertiary">
                        {t(opt.descriptionKey)}
                      </span>
                      {disabled && (
                        <span className="mt-1 block text-xs text-content-faint">
                          {t("settings.imageMode.engineNotInstalled")}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        isOn ? "border-accent bg-accent" : "border-border",
                      )}
                    >
                      {isOn && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-content-tertiary">
              <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("settings.imageMode.slowNote")}</span>
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function QaCheckCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const state = useAsync<{ enabled: boolean }>((s) => getQaCheck(s), []);

  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.data) setEnabled(state.data.enabled);
  }, [state.data]);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    const prev = enabled;
    setEnabled(next);
    try {
      await setQaCheck(next);
      toast.success(next ? t("settings.qa.turnedOn") : t("settings.qa.turnedOff"));
    } catch (err) {
      setEnabled(prev);
      toast.error(errorMessage(err) || t("settings.qa.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("settings.qa.title")}
        description={t("settings.qa.description")}
        action={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ShieldCheck className="h-4 w-4" />
          </span>
        }
      />
      <CardBody>
        {state.loading ? (
          <Skeleton className="h-14 w-full" />
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={toggle}
            aria-pressed={enabled}
            className={cn(
              "flex w-full items-start justify-between gap-3 rounded-lg border px-3.5 py-3 text-left",
              "transition-[background-color,border-color] duration-150 ease-out-strong",
              "disabled:cursor-not-allowed disabled:opacity-50",
              enabled
                ? "border-accent/40 bg-accent-soft"
                : "border-border-subtle bg-bg-inset hover:bg-bg-hover",
            )}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-content-primary">
                {enabled ? t("settings.qa.enabled") : t("settings.qa.disabled")}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-content-tertiary">
                {enabled ? t("settings.qa.enabledNote") : t("settings.qa.disabledNote")}
              </span>
            </span>
            {/* Toggle pill */}
            <span
              className={cn(
                "relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                enabled ? "bg-accent" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
                  enabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </span>
          </button>
        )}
      </CardBody>
    </Card>
  );
}
