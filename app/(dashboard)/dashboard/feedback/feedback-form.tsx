"use client";

import * as React from "react";
import { ArrowLeft, Check, Lightbulb, Send, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SECTION_OPTIONS,
  FEEDBACK_TYPE_OPTIONS,
  type FeedbackSection,
  type FeedbackType,
} from "@/lib/feedback/constants";
import { cn } from "@/lib/utils";
import { submitFeedback } from "@/services/data/feedback";
import { OmnideskSupportWidget } from "./omnidesk-support-widget";

type FeedbackFlow = "idea" | "support";
type FeedbackStep = "type" | "sections" | "message";

const STEP_LABELS: Record<FeedbackStep, string> = {
  type: "Тип",
  sections: "Раздел",
  message: "Сообщение",
};

function stepNumber(step: FeedbackStep) {
  return (["type", "sections", "message"] as FeedbackStep[]).indexOf(step) + 1;
}

export function FeedbackForm() {
  const [flow, setFlow] = React.useState<FeedbackFlow | null>(null);
  const [step, setStep] = React.useState<FeedbackStep>("type");
  const [type, setType] = React.useState<FeedbackType>(FEEDBACK_TYPE_OPTIONS[0].value);
  const [sections, setSections] = React.useState<FeedbackSection[]>([]);
  const [message, setMessage] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const toggleSection = (section: FeedbackSection, checked: boolean) => {
    setSections((current) => (checked ? [...current, section] : current.filter((item) => item !== section)));
  };

  const handleMessageChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(event.target.value.slice(0, FEEDBACK_MESSAGE_MAX_LENGTH));
  };

  const openIdeaFlow = () => {
    setFlow("idea");
    setStep("type");
  };

  const openSupportFlow = () => {
    setFlow("support");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedMessage = message.trim();
    if (sections.length === 0) {
      toast.error("Выберите хотя бы один раздел");
      setStep("sections");
      return;
    }

    if (!trimmedMessage) {
      toast.error("Напишите сообщение");
      setStep("message");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitFeedback({
        type,
        sections,
        message: trimmedMessage,
        sourceUrl: typeof window === "undefined" ? undefined : window.location.href,
      });
      setFlow(null);
      setStep("type");
      setSections([]);
      setMessage("");
      setType(FEEDBACK_TYPE_OPTIONS[0].value);
      toast.success("Спасибо, мы получили ваше сообщение.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить обращение. Попробуйте ещё раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          aria-pressed={flow === "idea"}
          onClick={openIdeaFlow}
          className={cn(
            "group flex min-w-0 flex-col rounded-lg border bg-card p-5 text-left shadow-sm transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            flow === "idea" && "border-primary bg-primary/5"
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </span>
          <span className="mt-4 break-words text-lg font-semibold">Поделиться идеей</span>
          <span className="mt-2 break-words text-sm leading-6 text-muted-foreground">
            Предложите улучшение, недостающую возможность или вопрос по продукту.
          </span>
        </button>

        <button
          type="button"
          aria-pressed={flow === "support"}
          onClick={openSupportFlow}
          className={cn(
            "group flex min-w-0 flex-col rounded-lg border bg-card p-5 text-left shadow-sm transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            flow === "support" && "border-primary bg-primary/5"
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Wrench className="h-5 w-5" />
          </span>
          <span className="mt-4 break-words text-lg font-semibold">Что-то не работает</span>
          <span className="mt-2 break-words text-sm leading-6 text-muted-foreground">
            Сообщите о проблеме, которая мешает пользоваться hiiire.
          </span>
        </button>
      </div>

      {flow === "support" ? (
        <OmnideskSupportWidget />
      ) : null}

      {flow === "idea" ? (
        <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 shadow-sm sm:p-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-primary">Шаг {stepNumber(step)} из 3</p>
                <h2 className="break-words text-xl font-semibold tracking-tight">{STEP_LABELS[step]}</h2>
              </div>
              <div className="flex gap-1.5">
                {(["type", "sections", "message"] as FeedbackStep[]).map((item) => (
                  <span
                    key={item}
                    className={cn(
                      "h-2 w-8 rounded-full bg-muted",
                      stepNumber(item) <= stepNumber(step) && "bg-primary"
                    )}
                  />
                ))}
              </div>
            </div>

            {step === "type" ? (
              <fieldset className="min-w-0 space-y-3">
                <legend className="text-sm font-medium">Что вы хотите передать?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FEEDBACK_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={type === option.value}
                      disabled={isSubmitting}
                      onClick={() => setType(option.value)}
                      className={cn(
                        "inline-flex h-11 max-w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                        type === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {type === option.value ? <Check className="h-4 w-4 shrink-0" /> : null}
                      <span className="min-w-0 truncate">{option.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {step === "sections" ? (
              <fieldset className="min-w-0 space-y-3">
                <legend className="text-sm font-medium">К какому разделу относится?</legend>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_SECTION_OPTIONS.map((option) => {
                    const checked = sections.includes(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={checked}
                        disabled={isSubmitting}
                        onClick={() => toggleSection(option.value, !checked)}
                        className={cn(
                          "inline-flex h-9 max-w-full items-center gap-1.5 rounded-md border px-3 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                          checked
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        {checked ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                        <span className="min-w-0 truncate">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {step === "message" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="feedback-message">Сообщение</Label>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {message.length}/{FEEDBACK_MESSAGE_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={handleMessageChange}
                  maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
                  placeholder="Например: хочется видеть отчёт по источникам кандидатов и конверсии по этапам."
                  rows={7}
                  disabled={isSubmitting}
                  className="min-h-44 resize-y"
                />
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => {
                  if (step === "message") setStep("sections");
                  else if (step === "sections") setStep("type");
                  else setFlow(null);
                }}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" />
                Назад
              </Button>

              {step === "type" ? (
                <Button type="button" onClick={() => setStep("sections")} disabled={isSubmitting} className="w-full sm:w-auto">
                  Далее
                </Button>
              ) : null}

              {step === "sections" ? (
                <Button
                  type="button"
                  onClick={() => setStep("message")}
                  disabled={sections.length === 0 || isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Далее
                </Button>
              ) : null}

              {step === "message" ? (
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  <Send className="h-4 w-4" />
                  {isSubmitting ? "Отправляем" : "Отправить"}
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
