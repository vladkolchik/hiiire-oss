"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  EMPLOYMENT_FORM_LABELS,
  EMPLOYMENT_FORM_OPTIONS,
  type EmploymentForm,
  normalizeEmploymentForms,
} from "@/lib/vacancies/employment-forms";
import { cn } from "@/lib/utils";

type EmploymentFormsMultiSelectProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  "onChange" | "type" | "value"
> & {
  value?: readonly EmploymentForm[] | null;
  onChange: (value: EmploymentForm[]) => void;
  placeholder?: string;
};

export const EmploymentFormsMultiSelect = React.forwardRef<HTMLButtonElement, EmploymentFormsMultiSelectProps>(
  ({ value, onChange, disabled = false, placeholder = "Не указано", className, ...buttonProps }, ref) => {
    const [open, setOpen] = React.useState(false);
    const selectedValues = React.useMemo(() => normalizeEmploymentForms(value), [value]);

    function toggleValue(nextValue: EmploymentForm) {
      if (selectedValues.includes(nextValue)) {
        onChange(selectedValues.filter((valueItem) => valueItem !== nextValue));
        return;
      }

      onChange(normalizeEmploymentForms([...selectedValues, nextValue]));
    }

    return (
      <div className="space-y-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn("w-full justify-between px-3 font-normal", className)}
              disabled={disabled}
              {...buttonProps}
            >
              <span className={cn("truncate text-left", selectedValues.length === 0 && "text-muted-foreground")}>
                {selectedValues.length === 0
                  ? placeholder
                  : selectedValues.map((valueItem) => EMPLOYMENT_FORM_LABELS[valueItem]).join(", ")}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
            <div className="border-b px-3 py-2 text-sm text-muted-foreground">
              {selectedValues.length > 0
                ? `Выбрано: ${selectedValues.length}`
                : "Можно выбрать один или несколько вариантов"}
            </div>

            <div className="max-h-64 overflow-y-auto p-1">
              {EMPLOYMENT_FORM_OPTIONS.map((option) => {
                const checked = selectedValues.includes(option.value);

                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleValue(option.value)}
                      disabled={disabled}
                      aria-label={option.label}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
                disabled={disabled || selectedValues.length === 0}
              >
                Очистить
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Готово
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {selectedValues.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedValues.map((valueItem) => (
              <Badge key={valueItem} variant="secondary">
                {EMPLOYMENT_FORM_LABELS[valueItem]}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);
EmploymentFormsMultiSelect.displayName = "EmploymentFormsMultiSelect";
