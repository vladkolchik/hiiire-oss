"use client";

import * as React from "react";
import { Loader2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const OMNIDESK_WIDGET_ID = "16299-a2n9kvek";
const OMNIDESK_SCRIPT_ID = "hiiire-omnidesk-widget-script";
const OMNIDESK_SCRIPT_SRC = "https://hiiire.omnidesk.ru/bundles/acmesite/js/cwidget0.2.min.js";
const OMNIDESK_LOAD_TIMEOUT_MS = 8_000;
const OMNIDESK_LOAD_ERROR_MESSAGE = "Не удалось открыть форму поддержки. Попробуйте ещё раз.";

type OmnideskIdentifyPayload = Record<string, string | undefined>;

type OmnideskEmailWidget = {
  readyQueue?: Array<() => void>;
  ready?: (callback: () => void) => void;
};

type OmnideskWidget = {
  ready?: () => void;
  identify?: OmnideskIdentifyPayload;
  hide?: string[];
};

type OmnideskEntry = unknown[] & {
  g_config?: {
    widget_id: string;
    user?: Record<string, unknown>;
  };
  type_widget?: "mail";
  email_widget?: OmnideskEmailWidget;
  widget?: OmnideskWidget;
  config?: (config: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    omni?: OmnideskEntry[];
    OmniWidgetApi?: {
      call: (command: string, payload?: OmnideskIdentifyPayload) => unknown;
    };
  }
}

function createOmnideskEntry() {
  const entry = [] as OmnideskEntry;
  const emailWidget: OmnideskEmailWidget = { readyQueue: [] };

  entry.g_config = { widget_id: OMNIDESK_WIDGET_ID };
  entry.type_widget = "mail";
  entry.email_widget = emailWidget;
  entry.config = function config(this: OmnideskEntry, userConfig: Record<string, unknown>) {
    this.g_config = {
      widget_id: OMNIDESK_WIDGET_ID,
      user: userConfig,
    };
  };
  emailWidget.ready = function ready(callback: () => void) {
    this.readyQueue?.push(callback);
  };

  return entry;
}

function getOmnideskEntry() {
  window.omni = window.omni ?? [];

  const existingEntry = window.omni.find((entry) => entry.g_config?.widget_id === OMNIDESK_WIDGET_ID);
  if (existingEntry) return existingEntry;

  const entry = createOmnideskEntry();
  window.omni.push(entry);
  return entry;
}

function ensureOmnideskScript({ onError }: { onError: () => void }) {
  const existingScript = document.getElementById(OMNIDESK_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    existingScript.onerror = () => {
      existingScript.remove();
      onError();
    };
    return;
  }

  const script = document.createElement("script");
  script.id = OMNIDESK_SCRIPT_ID;
  script.type = "text/javascript";
  script.async = true;
  script.src = OMNIDESK_SCRIPT_SRC;
  script.onerror = () => {
    const failedScript = script;
    failedScript.remove();
    onError();
  };

  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
}

function removeOmnideskScript() {
  document.getElementById(OMNIDESK_SCRIPT_ID)?.remove();
}

function waitForOmnideskApi({ shouldContinue }: { shouldContinue: () => boolean }) {
  return new Promise<void>((resolve, reject) => {
    if (window.OmniWidgetApi) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      if (!shouldContinue()) {
        window.clearInterval(intervalId);
        reject(new Error("Omnidesk widget open was cancelled"));
        return;
      }

      if (window.OmniWidgetApi) {
        window.clearInterval(intervalId);
        resolve();
        return;
      }

      if (Date.now() - startedAt > OMNIDESK_LOAD_TIMEOUT_MS) {
        window.clearInterval(intervalId);
        removeOmnideskScript();
        reject(new Error("Omnidesk widget is not ready"));
      }
    }, 100);
  });
}

function getCurrentPageUrl() {
  if (typeof window === "undefined") return undefined;

  return `${window.location.origin}${window.location.pathname}`;
}

function buildOmnideskIdentifyPayload(user: ReturnType<typeof useAuth>["user"]): OmnideskIdentifyPayload {
  return {
    user_email: user?.email,
    user_full_name: user?.name,
    company_name: user?.company,
    source: "hiiire dashboard bug report",
    source_url: getCurrentPageUrl(),
    subject: "Ошибка в hiiire",
  };
}

function configureOmnidesk(user: ReturnType<typeof useAuth>["user"]) {
  const entry = getOmnideskEntry();
  const identifyPayload = buildOmnideskIdentifyPayload(user);

  entry.config?.({
    display_button: false,
  });

  entry.widget = {
    ready() {
      entry.widget = entry.widget ?? {};
      entry.widget.identify = identifyPayload;
      entry.widget.hide = ["user_email", "user_full_name", "subject"];
    },
  };
  entry.widget.ready?.();

  entry.email_widget?.ready?.(() => {
    window.OmniWidgetApi?.call("hide_btn.16299");
  });
}

function clearOmnideskSupportContext() {
  const entry = window.omni?.find((item) => item.g_config?.widget_id === OMNIDESK_WIDGET_ID);

  if (entry?.widget) {
    delete entry.widget.identify;
    delete entry.widget.hide;
    delete entry.widget.ready;
  }

  window.OmniWidgetApi?.call("reset.16299");
  window.OmniWidgetApi?.call("close_widget.16299");
  window.OmniWidgetApi?.call("hide_btn.16299");
}

export function OmnideskSupportWidget() {
  const { user } = useAuth();
  const [isOpening, setIsOpening] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const mountedRef = React.useRef(false);
  const openRequestRef = React.useRef(false);
  const requestIdRef = React.useRef(0);

  const isCurrentOpenRequest = React.useCallback((requestId: number) => {
    return mountedRef.current && openRequestRef.current && requestIdRef.current === requestId;
  }, []);

  const handleOmnideskLoadError = React.useCallback(() => {
    if (!mountedRef.current) return;

    setLoadError(OMNIDESK_LOAD_ERROR_MESSAGE);
    setIsOpening(false);
    openRequestRef.current = false;
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    ensureOmnideskScript({ onError: handleOmnideskLoadError });

    return () => {
      mountedRef.current = false;
      openRequestRef.current = false;
      clearOmnideskSupportContext();
    };
  }, [handleOmnideskLoadError]);

  React.useEffect(() => {
    configureOmnidesk(user);
  }, [user]);

  const openSupportForm = async () => {
    if (openRequestRef.current) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    openRequestRef.current = true;
    setIsOpening(true);
    setLoadError(null);
    configureOmnidesk(user);
    ensureOmnideskScript({ onError: handleOmnideskLoadError });

    try {
      await waitForOmnideskApi({ shouldContinue: () => isCurrentOpenRequest(requestId) });
      if (!isCurrentOpenRequest(requestId)) return;

      window.OmniWidgetApi?.call("hide_btn.16299");
      window.OmniWidgetApi?.call("open_widget.16299");
    } catch {
      if (isCurrentOpenRequest(requestId)) {
        setLoadError(OMNIDESK_LOAD_ERROR_MESSAGE);
      }
    } finally {
      if (isCurrentOpenRequest(requestId)) {
        setIsOpening(false);
        openRequestRef.current = false;
      }
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
          <Wrench className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-base font-semibold">Напишите в поддержку</h2>
            <p className="break-words text-sm leading-6 text-muted-foreground">
              Откроем форму Omnidesk и передадим ваш email, компанию и страницу, с которой вы обращаетесь.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" className="w-full sm:w-auto" onClick={openSupportForm} disabled={isOpening}>
              {isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              {isOpening ? "Открываем" : "Сообщить об ошибке"}
            </Button>
            {loadError ? <p className="break-words text-sm text-destructive">{loadError}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
