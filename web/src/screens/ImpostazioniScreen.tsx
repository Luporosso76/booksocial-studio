import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Check,
  Images,
  KeyRound,
  Languages,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { Badge, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { Input, Textarea, Field, selectClass } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast";
import { useAsync, errorMessage } from "@/lib/useAsync";
import {
  getAiImageMode,
  setAiImageMode,
  getQaCheck,
  setQaCheck,
  getAiSettings,
  saveAiSettings,
  testAiText,
  testAiImage,
  listAiModels,
  addAiModel,
  removeAiModel,
  aiCliStatus,
  type AiTestResult,
} from "@/api/endpoints";
import type {
  AiImageMode,
  AiImageModeState,
  AiImageFallback,
  AiImageProvider,
  AiSettings,
  AiSettingsPatch,
  AiTextFallback,
  AiTextProvider,
  CliStatus,
  ImageStyleCfg,
  ImageStylePreset,
} from "@/api/types";
import { cn } from "@/lib/cn";

type AiTab = "text" | "image" | "contentImages" | "quality" | "extra" | "language" | "password";

export function ImpostazioniScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AiTab>("text");

  const tabs: { id: AiTab; label: string }[] = [
    { id: "text", label: t("settings.ai.tabText") },
    { id: "image", label: t("settings.ai.tabImage") },
    { id: "contentImages", label: t("settings.ai.tabContentImages") },
    { id: "quality", label: t("settings.ai.tabQuality") },
    { id: "extra", label: t("settings.ai.tabExtra") },
    { id: "language", label: t("language.label") },
    { id: "password", label: t("auth.changePassword") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />

      <div className="flex flex-wrap items-center gap-1" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
              tab === tb.id
                ? "bg-accent-soft text-accent"
                : "text-content-tertiary hover:bg-bg-hover hover:text-content-secondary",
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {(tab === "text" || tab === "image") && <AiProvidersCard section={tab} />}
      {tab === "contentImages" && <AiImageModeCard />}
      {tab === "quality" && <QaCheckCard />}
      {tab === "extra" && <PromptExtrasCard />}
      {tab === "language" && (
        <Card>
          <CardHeader
            title={t("settings.languageTitle")}
            description={t("settings.languageDescription")}
            action={
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Languages className="h-4 w-4" />
              </span>
            }
          />
          <CardBody>
            <LanguageSwitcher />
          </CardBody>
        </Card>
      )}
      {tab === "password" && (
        <Card>
          <CardHeader
            title={t("auth.changePassword")}
            description={t("auth.changePasswordDescription")}
            action={
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <KeyRound className="h-4 w-4" />
              </span>
            }
          />
          <CardBody>
            <div className="max-w-sm">
              <ChangePasswordForm />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// Provider TESTO: tutti agentici via CLI (opencode/codex/claude/agy) tranne ollama (locale).
const TEXT_PROVIDERS: AiTextProvider[] = ["opencode", "codex", "claude", "agy", "ollama"];

// Provider testo che girano via CLI agente: mostrano stato CLI + modello, mai una chiave.
const CLI_TEXT_PROVIDERS = ["opencode", "codex", "claude", "agy"] as const;
type CliTextProvider = (typeof CLI_TEXT_PROVIDERS)[number];

function isCliTextProvider(p: AiTextProvider): p is CliTextProvider {
  return (CLI_TEXT_PROVIDERS as readonly string[]).includes(p);
}

// Provider CLI testo per cui la lista modelli e editabile a mano (default unione DB).
const TEXT_MODEL_EDITABLE: CliTextProvider[] = ["codex", "claude"];

// Mappa provider CLI → campo modello (string) da salvare nel patch text.*.
type CliModelField = "opencodeModel" | "codexModel" | "claudeModel" | "agyModel";
const CLI_MODEL_FIELD: Record<CliTextProvider, CliModelField> = {
  opencode: "opencodeModel",
  codex: "codexModel",
  claude: "claudeModel",
  agy: "agyModel",
};

// Provider testo di FALLBACK selezionabili ('none' = nessuno).
const TEXT_FALLBACKS: AiTextFallback[] = ["none", "opencode", "codex", "claude", "agy", "ollama"];

// Provider IMMAGINI: locale, agentico (agy) e API a chiave dedicata.
const IMAGE_PROVIDERS: AiImageProvider[] = [
  "local",
  "agy",
  "openai",
  "gemini",
  "stability",
  "bfl",
  "replicate",
  "fal",
];

// Provider immagini di FALLBACK selezionabili ('none' = nessuno).
const IMAGE_FALLBACKS: AiImageFallback[] = [
  "none",
  "local",
  "agy",
  "openai",
  "gemini",
  "stability",
  "bfl",
  "replicate",
  "fal",
];

const STYLE_PRESETS: ImageStylePreset[] = [
  "graphic-novel",
  "cel-anime",
  "painterly",
  "photorealistic",
  "cinematic",
  "watercolor",
  "oil",
  "3d-render",
  "flat-vector",
  "storybook",
  "pencil-sketch",
  "concept-art",
  "line-art",
  "custom",
];

const LOCAL_STYLE_PROVIDERS = ["local"];

const DEFAULT_STYLE: ImageStyleCfg = {
  preset: "graphic-novel",
  customStyle: "",
  intensity: 75,
  vividness: 55,
  steps: null,
  cfg: null,
};

// Quale provider usa quale "famiglia" di chiave (per badge + invio chiavi).
type KeyName = "openai" | "gemini" | "stability" | "bfl" | "replicate" | "fal";

const ALL_KEY_NAMES: KeyName[] = ["openai", "gemini", "stability", "bfl", "replicate", "fal"];

function ImageStyleBlock({
  title,
  description,
  provider,
  style,
  onField,
}: {
  title: string;
  description: string;
  provider: string;
  style: ImageStyleCfg;
  onField: (key: keyof ImageStyleCfg, value: ImageStyleCfg[keyof ImageStyleCfg]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
      <div>
        <h5 className="text-sm font-semibold text-content-primary">{title}</h5>
        <p className="text-xs leading-snug text-content-tertiary">{description}</p>
      </div>

      <Field label={t("settings.ai.imageStyle.preset")}>
        <select
          className={selectClass}
          value={style.preset}
          onChange={(e) => onField("preset", e.target.value as ImageStylePreset)}
        >
          {STYLE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`settings.ai.imageStyle.presets.${p}`)}
            </option>
          ))}
        </select>
      </Field>

      {style.preset === "custom" && (
        <Field
          label={t("settings.ai.imageStyle.customStyle")}
          hint={t("settings.ai.imageStyle.customStyleHint")}
        >
          <Input
            value={style.customStyle}
            onChange={(e) => onField("customStyle", e.target.value)}
            placeholder={t("settings.ai.imageStyle.customStylePlaceholder")}
          />
        </Field>
      )}

      <Field
        label={`${t("settings.ai.imageStyle.intensity")}: ${style.intensity}`}
        hint={t("settings.ai.imageStyle.intensityHint")}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={style.intensity}
          onChange={(e) => onField("intensity", Number(e.target.value))}
          className="w-full accent-accent"
        />
      </Field>

      <Field
        label={`${t("settings.ai.imageStyle.vividness")}: ${style.vividness}`}
        hint={t("settings.ai.imageStyle.vividnessHint")}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={style.vividness}
          onChange={(e) => onField("vividness", Number(e.target.value))}
          className="w-full accent-accent"
        />
      </Field>

      {LOCAL_STYLE_PROVIDERS.includes(provider) && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("settings.ai.imageStyle.steps")}
            hint={t("settings.ai.imageStyle.engineOverrideHint")}
          >
            <Input
              type="number"
              min={1}
              value={style.steps ?? ""}
              onChange={(e) =>
                onField("steps", e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder={t("settings.ai.imageStyle.defaultPlaceholder")}
            />
          </Field>
          <Field
            label={t("settings.ai.imageStyle.cfg")}
            hint={t("settings.ai.imageStyle.engineOverrideHint")}
          >
            <Input
              type="number"
              min={0}
              step={0.1}
              value={style.cfg ?? ""}
              onChange={(e) =>
                onField("cfg", e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder={t("settings.ai.imageStyle.defaultPlaceholder")}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function AiProvidersCard({ section }: { section: "text" | "image" }) {
  const { t } = useTranslation();
  const toast = useToast();
  const state = useAsync<AiSettings>((s) => getAiSettings(s), []);

  // Bozza locale dei campi (testo + immagini). Le chiavi sono gestite a parte.
  const [text, setText] = useState<AiSettings["text"] | null>(null);
  const [image, setImage] = useState<AiSettings["image"] | null>(null);
  const [imageStyle, setImageStyle] = useState<Record<string, ImageStyleCfg> | null>(null);
  // Input chiavi: '' = invariata. Tracciamo separatamente quali sono state "rimosse".
  const emptyKeyRecord = (): Record<KeyName, string> => ({
    openai: "",
    gemini: "",
    stability: "",
    bfl: "",
    replicate: "",
    fal: "",
  });
  const emptyRemovedRecord = (): Record<KeyName, boolean> => ({
    openai: false,
    gemini: false,
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
      setImageStyle(state.data.imageStyle);
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
  const styleFor = (provider: string): ImageStyleCfg => imageStyle?.[provider] || DEFAULT_STYLE;
  const currentStyle: ImageStyleCfg = image ? styleFor(image.provider) : DEFAULT_STYLE;
  function setStyleFieldFor<K extends keyof ImageStyleCfg>(
    provider: string,
    key: K,
    value: ImageStyleCfg[K],
  ) {
    setImageStyle((prev) => {
      const base = prev ?? {};
      const cur = base[provider] ?? DEFAULT_STYLE;
      return { ...base, [provider]: { ...cur, [key]: value } };
    });
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
    if (imageStyle) {
      patch.imageStyle = { [image.provider]: styleFor(image.provider) };
      const fb = image.fallbackProvider;
      if (fb && fb !== "none" && fb !== image.provider) {
        patch.imageStyle[fb] = styleFor(fb);
      }
    }

    setSaving(true);
    try {
      await saveAiSettings(patch);
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
            {section === "text" && (
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
                    {TEXT_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {t(`settings.ai.textProvider.${p}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                {isCliTextProvider(text.provider) &&
                  (() => {
                    const provider = text.provider;
                    const field = CLI_MODEL_FIELD[provider];
                    return (
                      <CliProviderSection
                        tool={provider}
                        model={text[field] ?? ""}
                        onModelChange={(v) => setTextField(field, v)}
                        editable={TEXT_MODEL_EDITABLE.includes(provider)}
                      />
                    );
                  })()}

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
                      provider="ollama"
                      value={text.ollamaModel}
                      onChange={(v) => setTextField("ollamaModel", v)}
                      autoLoad
                    />
                  </>
                )}

                <Field label={t("settings.ai.fallbackText")} hint={t("settings.ai.fallbackNote")}>
                  <select
                    className={selectClass}
                    value={text.fallbackProvider}
                    onChange={(e) =>
                      setTextField("fallbackProvider", e.target.value as AiTextFallback)
                    }
                  >
                    {TEXT_FALLBACKS.map((p) => (
                      <option key={p} value={p}>
                        {p === "none"
                          ? t("settings.ai.fallbackNone")
                          : t(`settings.ai.textProvider.${p}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                {text.fallbackProvider !== "none" && (
                  <ModelSelectField
                    label={t("settings.ai.fallbackModel")}
                    provider={text.fallbackProvider}
                    value={text.fallbackModel}
                    onChange={(v) => setTextField("fallbackModel", v)}
                    autoLoad={
                      !TEXT_MODEL_EDITABLE.includes(text.fallbackProvider as CliTextProvider)
                    }
                    editable={TEXT_MODEL_EDITABLE.includes(
                      text.fallbackProvider as CliTextProvider,
                    )}
                  />
                )}

                <TestConnectionButton run={() => testAiText()} />
              </section>
            )}

            {/* --- Provider IMMAGINI --- */}
            {section === "image" && (
              <section className="flex flex-col gap-3">
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

                {image.provider === "local" && (
                  <p className="text-xs leading-snug text-content-tertiary">
                    {t("settings.ai.localImageNote")}
                  </p>
                )}

                {image.provider === "agy" && (
                  <>
                    <p className="text-xs leading-snug text-content-tertiary">
                      {t("settings.ai.agentImageNote")}
                    </p>
                    <ModelSelectField
                      provider="agy"
                      value={image.agyImageModel ?? ""}
                      onChange={(v) => setImageField("agyImageModel", v)}
                      autoLoad
                    />
                  </>
                )}

                {image.provider === "openai" && (
                  <>
                    <Field label={t("settings.ai.baseUrl")}>
                      <Input
                        value={image.openaiBaseUrl}
                        onChange={(e) => setImageField("openaiBaseUrl", e.target.value)}
                        placeholder="https://api.openai.com/v1"
                      />
                    </Field>
                    <ModelSelectField
                      provider="openai"
                      value={image.openaiImageModel}
                      onChange={(v) => setImageField("openaiImageModel", v)}
                      editable
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
                {image.provider === "gemini" && (
                  <>
                    <Field label={t("settings.ai.baseUrl")}>
                      <Input
                        value={image.googleBaseUrl}
                        onChange={(e) => setImageField("googleBaseUrl", e.target.value)}
                      />
                    </Field>
                    <ModelSelectField
                      provider="gemini"
                      value={image.geminiImageModel}
                      onChange={(v) => setImageField("geminiImageModel", v)}
                      editable
                    />
                    <ApiKeyField
                      label={t("settings.ai.apiKey")}
                      configured={keyConfigured("gemini")}
                      value={keyInputs.gemini}
                      onChange={(v) => onKeyInput("gemini", v)}
                      onRemove={() => removeKey("gemini")}
                    />
                  </>
                )}
                {image.provider === "stability" && (
                  <>
                    <ModelSelectField
                      provider="stability"
                      value={image.stabilityImageModel}
                      onChange={(v) => setImageField("stabilityImageModel", v)}
                      editable
                    />
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
                    <ModelSelectField
                      provider="bfl"
                      value={image.bflImageModel}
                      onChange={(v) => setImageField("bflImageModel", v)}
                      editable
                    />
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
                    <ModelSelectField
                      provider="replicate"
                      value={image.replicateImageModel}
                      onChange={(v) => setImageField("replicateImageModel", v)}
                      editable
                    />
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
                    <ModelSelectField
                      provider="fal"
                      value={image.falImageModel}
                      onChange={(v) => setImageField("falImageModel", v)}
                      editable
                    />
                    <ApiKeyField
                      label={t("settings.ai.apiKey")}
                      configured={keyConfigured("fal")}
                      value={keyInputs.fal}
                      onChange={(v) => onKeyInput("fal", v)}
                      onRemove={() => removeKey("fal")}
                    />
                  </>
                )}

                <Field label={t("settings.ai.fallbackImage")} hint={t("settings.ai.fallbackNote")}>
                  <select
                    className={selectClass}
                    value={image.fallbackProvider}
                    onChange={(e) =>
                      setImageField("fallbackProvider", e.target.value as AiImageFallback)
                    }
                  >
                    {IMAGE_FALLBACKS.map((p) => (
                      <option key={p} value={p}>
                        {p === "none"
                          ? t("settings.ai.fallbackNone")
                          : t(`settings.ai.imageProvider.${p}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                {image.fallbackProvider !== "none" && image.fallbackProvider !== "local" && (
                  <ModelSelectField
                    label={t("settings.ai.fallbackModel")}
                    provider={image.fallbackProvider}
                    value={image.fallbackModel}
                    onChange={(v) => setImageField("fallbackModel", v)}
                    autoLoad={image.fallbackProvider === "agy"}
                    editable={image.fallbackProvider !== "agy"}
                  />
                )}

                <ImageStyleBlock
                  title={t("settings.ai.imageStyle.primaryTitle")}
                  description={t("settings.ai.imageStyle.description", {
                    provider: t(`settings.ai.imageProvider.${image.provider}`),
                  })}
                  provider={image.provider}
                  style={currentStyle}
                  onField={(key, value) => setStyleFieldFor(image.provider, key, value)}
                />

                {image.fallbackProvider !== "none" && image.fallbackProvider !== image.provider && (
                  <ImageStyleBlock
                    title={t("settings.ai.imageStyle.fallbackTitle")}
                    description={t("settings.ai.imageStyle.description", {
                      provider: t(`settings.ai.imageProvider.${image.fallbackProvider}`),
                    })}
                    provider={image.fallbackProvider}
                    style={styleFor(image.fallbackProvider)}
                    onField={(key, value) => setStyleFieldFor(image.fallbackProvider, key, value)}
                  />
                )}

                <TestConnectionButton run={() => testAiImage(image.provider)} />
              </section>
            )}

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

// Campo modello con SELECT popolata da listAiModels + opzione manuale "Altro…".
// `autoLoad` carica la lista al mount (provider con lista automatica: opencode/agy/ollama).
// `editable` abilita il mini-editor "Aggiungi modello" (input + ✓) e la ✕ per rimuovere ogni
// voce (provider con lista DB: codex/claude/openai/google/stability/bfl/replicate/fal).
const MANUAL_OPTION = "__manual__";
function ModelSelectField({
  provider,
  value,
  onChange,
  autoLoad = false,
  editable = false,
  label,
}: {
  provider: string;
  value: string;
  onChange: (value: string) => void;
  autoLoad?: boolean;
  editable?: boolean;
  label?: string;
}) {
  const { t } = useTranslation();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true = l'utente ha scelto l'inserimento manuale (o la lista non contiene il valore).
  const [manual, setManual] = useState(false);
  // Input del mini-editor "Aggiungi modello" (solo provider editabili).
  const [newModel, setNewModel] = useState("");
  const [mutating, setMutating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listAiModels({ provider });
      setModels(res.models);
      if (res.error) setError(res.error);
      if (!res.models.length) {
        setManual(true);
        if (!editable) setError(res.error || t("settings.ai.modelsEmpty"));
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

  async function addModel() {
    const name = newModel.trim();
    if (!name || mutating) return;
    setMutating(true);
    setError(null);
    try {
      const res = await addAiModel(provider, name);
      setModels(res.models);
      setNewModel("");
      setManual(false);
      onChange(name);
    } catch {
      setError(t("settings.ai.modelsLoadFailed"));
    } finally {
      setMutating(false);
    }
  }

  async function dropModel(name: string) {
    if (mutating) return;
    setMutating(true);
    setError(null);
    try {
      const res = await removeAiModel(provider, name);
      setModels(res.models);
      if (value === name) onChange(res.models[0] ?? "");
    } catch {
      setError(t("settings.ai.modelsLoadFailed"));
    } finally {
      setMutating(false);
    }
  }

  // Carica al mount per i provider a lista automatica.
  useEffect(() => {
    if (autoLoad) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const hasList = models.length > 0;
  const selectValue = manual || !models.includes(value) ? MANUAL_OPTION : value;

  return (
    <Field label={label ?? t("settings.ai.modelSelect")}>
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

        {editable && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border-subtle bg-bg-inset px-2.5 py-2">
            {hasList && (
              <ul className="flex flex-col gap-1">
                {models.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-content-secondary">{m}</span>
                    <button
                      type="button"
                      aria-label={t("settings.ai.removeModel")}
                      disabled={mutating}
                      onClick={() => void dropModel(m)}
                      className="shrink-0 rounded p-0.5 text-content-faint transition-colors hover:text-danger disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addModel();
                  }
                }}
                placeholder={t("settings.ai.addModelPlaceholder")}
              />
              <Button
                variant="secondary"
                size="sm"
                type="button"
                aria-label={t("settings.ai.addModel")}
                loading={mutating}
                disabled={mutating || !newModel.trim()}
                onClick={() => void addModel()}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

// Provider TESTO agentico (opencode/codex/claude/agy): stato CLI + verifica, senza chiave API.
// L'auth vive nel CLI (login da terminale); l'app non salva alcun token. Il modello passa per
// ModelSelectField: lista automatica (opencode/agy) o lista DB editabile (codex/claude).
function CliProviderSection({
  tool,
  model,
  onModelChange,
  editable,
}: {
  tool: string;
  model: string;
  onModelChange: (value: string) => void;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function check() {
    setLoading(true);
    try {
      setStatus(await aiCliStatus(tool));
    } catch {
      setStatus({ tool, installed: false, version: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    aiCliStatus(tool)
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
          loading={loading}
          disabled={loading}
          onClick={() => void check()}
        >
          {t("settings.ai.cliVerify")}
        </Button>
      </div>

      <ModelSelectField
        provider={tool}
        value={model}
        onChange={onModelChange}
        autoLoad={!editable}
        editable={editable}
      />
    </>
  );
}

// Pulsante "Prova connessione" riusabile (testo o immagini). Chiama `run`, mostra spinner e
// poi l'esito inline (✓ + anteprima/provider, oppure ✗ + errore). Stato locale, nessun toast.
function TestConnectionButton({ run }: { run: () => Promise<AiTestResult> }) {
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
                        <span className="mt-1 flex items-center gap-1 text-xs text-content-tertiary">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-content-secondary" />
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

            <p className="flex items-start gap-2 rounded-md bg-bg-inset px-3 py-2.5 text-sm leading-relaxed text-content-secondary">
              <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" />
              <span>{t("settings.imageMode.slowNote")}</span>
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// Istruzioni-extra globali: testo accodato a tutti i prompt di testo e immagini, in aggiunta al core.
// La controparte per-libro sta nella scheda libro (Visivo → Direttive).
function PromptExtrasCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const state = useAsync<AiSettings>((s) => getAiSettings(s), []);

  const [textPrompt, setTextPrompt] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.data) {
      setTextPrompt(state.data.extra?.textPrompt ?? "");
      setImagePrompt(state.data.extra?.imagePrompt ?? "");
    }
  }, [state.data]);

  async function save() {
    setSaving(true);
    try {
      await saveAiSettings({ extra: { textPrompt, imagePrompt } });
      toast.success(t("settings.ai.saved"));
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err) || t("settings.ai.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("settings.ai.extraTitle")}
        description={t("settings.ai.extraDescription")}
        action={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
        }
      />
      <CardBody className="flex flex-col gap-5">
        {state.loading ? (
          <Skeleton className="h-64 w-full" />
        ) : state.error ? (
          <ErrorBanner message={state.error} onRetry={state.reload} />
        ) : (
          <>
            <p className="flex items-start gap-2 rounded-md bg-bg-inset px-3 py-2.5 text-sm leading-relaxed text-content-secondary">
              <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" />
              <span>{t("settings.ai.extraNote")}</span>
            </p>
            <Field label={t("settings.ai.extraTextLabel")} hint={t("settings.ai.extraTextHint")}>
              <Textarea
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                rows={5}
                placeholder={t("settings.ai.extraTextPlaceholder")}
              />
            </Field>
            <Field label={t("settings.ai.extraImageLabel")} hint={t("settings.ai.extraImageHint")}>
              <Textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                rows={5}
                placeholder={t("settings.ai.extraImagePlaceholder")}
              />
            </Field>
            <div className="flex justify-end border-t border-border-subtle pt-4">
              <Button variant="primary" loading={saving} disabled={saving} onClick={save}>
                {t("common.save")}
              </Button>
            </div>
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
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
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
