"use client";

import { Copy, Plus, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildUtmLink, type CustomLinkParam, type UtmLinkParams } from "@/lib/marketing/utm-link-builder";
import { cn } from "@/lib/utils";

type TargetPreset = {
  label: string;
  url: string;
};

type CustomParamRow = CustomLinkParam & {
  id: string;
};

const TARGET_PRESETS: TargetPreset[] = [
  { label: "Лендинг", url: "https://hiiire.com/" },
  { label: "Заявка", url: "https://hiiire.com/request-access" },
  { label: "Кастом", url: "" },
];

const DEFAULT_UTM: Required<UtmLinkParams> = {
  source: "telegram",
  medium: "post",
  campaign: "may_launch",
  content: "landing_cta",
  term: "",
};

const UTM_HELP = [
  {
    name: "utm_source",
    meaning: "Где размещаем ссылку.",
    example: "telegram, email, yandex, google, vk, hh",
    why: "Помогает понять площадку, которая привела пользователя.",
  },
  {
    name: "utm_medium",
    meaning: "Тип канала или формат размещения.",
    example: "post, newsletter, cpc, partner, retargeting",
    why: "Отделяет рекламу, рассылки, партнёрки и органические посты.",
  },
  {
    name: "utm_campaign",
    meaning: "Название кампании.",
    example: "may_launch, recruiters_webinar, brand_search",
    why: "Объединяет несколько объявлений или писем в одну кампанию.",
  },
  {
    name: "utm_content",
    meaning: "Вариант креатива, кнопки или места размещения.",
    example: "landing_cta, banner_top, case_study, button_primary",
    why: "Позволяет сравнить разные объявления внутри одной кампании.",
  },
  {
    name: "utm_term",
    meaning: "Ключевое слово, сегмент или аудитория.",
    example: "recruiters, hr_directors, hiiire_keyword",
    why: "Полезно для поисковой рекламы и сравнения аудиторий.",
  },
  {
    name: "Доп. параметры",
    meaning: "Любые пары key=value, которые нужны конкретной кампании.",
    example: "promo=hrweek, audience=recruiters, variant=a",
    why: "Добавляет внутренние маркеры без изменения стандартных UTM.",
  },
];

function nextCustomParamId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function UtmLinkBuilder() {
  const [baseUrl, setBaseUrl] = useState("https://hiiire.com/");
  const [activePreset, setActivePreset] = useState(TARGET_PRESETS[0].label);
  const [utm, setUtm] = useState<Required<UtmLinkParams>>(DEFAULT_UTM);
  const [customParams, setCustomParams] = useState<CustomParamRow[]>([
    { id: nextCustomParamId(), key: "audience", value: "recruiters" },
  ]);
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    try {
      return buildUtmLink({ baseUrl, utm, customParams });
    } catch {
      return "Проверьте URL назначения.";
    }
  }, [baseUrl, customParams, utm]);

  const setPreset = (preset: TargetPreset) => {
    setActivePreset(preset.label);
    if (preset.url) setBaseUrl(preset.url);
  };

  const updateUtm = (field: keyof Required<UtmLinkParams>, value: string) => {
    setUtm((current) => ({ ...current, [field]: value }));
  };

  const addCustomParam = () => {
    setCustomParams((current) => [...current, { id: nextCustomParamId(), key: "", value: "" }]);
  };

  const updateCustomParam = (id: string, field: keyof CustomLinkParam, value: string) => {
    setCustomParams((current) => current.map((param) => (param.id === id ? { ...param, [field]: value } : param)));
  };

  const removeCustomParam = (id: string) => {
    setCustomParams((current) => current.filter((param) => param.id !== id));
  };

  const resetBuilder = () => {
    setBaseUrl("https://hiiire.com/");
    setActivePreset(TARGET_PRESETS[0].label);
    setUtm(DEFAULT_UTM);
    setCustomParams([]);
    setCopied(false);
  };

  const copyLink = async () => {
    if (link === "Проверьте URL назначения.") return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-lg">Конструктор ссылок</CardTitle>
            <CardDescription>
              Соберите рекламную ссылку на лендинг или заявку. Пустые параметры не попадут в итоговый URL.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={resetBuilder}>
              <RotateCcw className="size-4" />
              Очистить
            </Button>
            <Button type="button" size="sm" onClick={copyLink} disabled={link === "Проверьте URL назначения."}>
              <Copy className="size-4" />
              {copied ? "Скопировано" : "Скопировать"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.75fr)_minmax(520px,1.5fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {TARGET_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={activePreset === preset.label ? "default" : "outline"}
                  onClick={() => setPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="utm-builder-base-url">URL назначения</Label>
              <Input
                id="utm-builder-base-url"
                value={baseUrl}
                maxLength={300}
                onChange={(event) => {
                  setActivePreset("Кастом");
                  setBaseUrl(event.target.value);
                }}
              />
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Длинная UTM-ссылка нормальна для рекламы и рассылок: обычно её прячут за кнопкой или объявлением.
              Короткие ссылки лучше делать отдельной фичей, если понадобится считать клики по slug.
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="utm-builder-source">utm_source</Label>
                <Input
                  id="utm-builder-source"
                  value={utm.source}
                  maxLength={80}
                  placeholder="telegram"
                  onChange={(event) => updateUtm("source", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="utm-builder-medium">utm_medium</Label>
                <Input
                  id="utm-builder-medium"
                  value={utm.medium}
                  maxLength={80}
                  placeholder="post"
                  onChange={(event) => updateUtm("medium", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="utm-builder-campaign">utm_campaign</Label>
                <Input
                  id="utm-builder-campaign"
                  value={utm.campaign}
                  maxLength={120}
                  placeholder="may_launch"
                  onChange={(event) => updateUtm("campaign", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="utm-builder-content">utm_content</Label>
                <Input
                  id="utm-builder-content"
                  value={utm.content}
                  maxLength={120}
                  placeholder="landing_cta"
                  onChange={(event) => updateUtm("content", event.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="utm-builder-term">utm_term</Label>
                <Input
                  id="utm-builder-term"
                  value={utm.term}
                  maxLength={120}
                  placeholder="keyword или audience, опционально"
                  onChange={(event) => updateUtm("term", event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">Доп. параметры</div>
                  <div className="text-xs text-muted-foreground">
                    Например: promo, audience, variant. Click IDs сюда не добавляем вручную.
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addCustomParam}>
                  <Plus className="size-4" />
                  Добавить
                </Button>
              </div>

              <div className="space-y-2">
                {customParams.length ? (
                  customParams.map((param) => (
                    <div key={param.id} className="grid gap-2 sm:grid-cols-[minmax(140px,0.8fr)_minmax(180px,1fr)_auto]">
                      <Input
                        aria-label="Ключ дополнительного параметра"
                        value={param.key}
                        maxLength={80}
                        placeholder="promo"
                        onChange={(event) => updateCustomParam(param.id, "key", event.target.value)}
                      />
                      <Input
                        aria-label="Значение дополнительного параметра"
                        value={param.value}
                        maxLength={160}
                        placeholder="hrweek"
                        onChange={(event) => updateCustomParam(param.id, "value", event.target.value)}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="text-destructive sm:self-center"
                        aria-label="Удалить параметр"
                        onClick={() => removeCustomParam(param.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Дополнительных параметров нет.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div
            className={cn(
              "min-h-9 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-primary break-all",
              link === "Проверьте URL назначения." && "text-destructive",
            )}
          >
            {link}
          </div>
          <Button type="button" onClick={copyLink} disabled={link === "Проверьте URL назначения."}>
            <Copy className="size-4" />
            {copied ? "Скопировано" : "Скопировать"}
          </Button>
        </div>

        <details className="rounded-md border bg-background px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Что значит каждый параметр</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {UTM_HELP.map((item) => (
              <div key={item.name} className="rounded-md bg-muted/40 p-3">
                <div className="font-mono text-xs font-semibold text-primary">{item.name}</div>
                <div className="mt-1 text-sm">{item.meaning}</div>
                <div className="mt-1 text-xs text-muted-foreground">Примеры: {item.example}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.why}</div>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
