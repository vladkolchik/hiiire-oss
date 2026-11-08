export type UtmLinkParams = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

export type CustomLinkParam = {
  key: string;
  value: string;
};

export type BuildUtmLinkInput = {
  baseUrl: string;
  utm: UtmLinkParams;
  customParams?: CustomLinkParam[];
};

const RESERVED_CLICK_ID_KEYS = new Set(["gclid", "fbclid", "msclkid"]);
const UTM_PARAM_KEYS = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  content: "utm_content",
  term: "utm_term",
} as const satisfies Record<keyof UtmLinkParams, string>;

export function normalizeLinkParamValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeLinkParamKey(value: string) {
  return normalizeLinkParamValue(value).replace(/[^a-z0-9_.-]/g, "");
}

export function buildUtmLink({ baseUrl, utm, customParams = [] }: BuildUtmLinkInput) {
  const url = new URL(baseUrl.trim() || "https://hiiire.com/", "https://hiiire.com");

  for (const [field, paramName] of Object.entries(UTM_PARAM_KEYS) as Array<[keyof UtmLinkParams, string]>) {
    const value = normalizeLinkParamValue(utm[field] ?? "");
    if (value) {
      url.searchParams.set(paramName, value);
    } else {
      url.searchParams.delete(paramName);
    }
  }

  for (const param of customParams) {
    const key = normalizeLinkParamKey(param.key);
    const value = normalizeLinkParamValue(param.value);
    if (!key || key.startsWith("utm_") || RESERVED_CLICK_ID_KEYS.has(key)) continue;

    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}
