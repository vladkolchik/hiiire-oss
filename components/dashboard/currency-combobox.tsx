"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { currencyOptions, getCurrencyOption } from "@/lib/currency";

type CurrencyComboboxProps = Omit<React.ComponentPropsWithoutRef<typeof Button>, "onChange" | "type"> & {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
};

export const CurrencyCombobox = React.forwardRef<HTMLButtonElement, CurrencyComboboxProps>(
  ({ value, onChange, disabled = false, placeholder = "Выберите валюту", className, ...buttonProps }, ref) => {
    const [open, setOpen] = React.useState(false);

    const rawValue = typeof value === "string" ? value.trim() : "";
    const selectedCurrency = getCurrencyOption(rawValue);
    const hasUnsupportedValue = rawValue.length > 0 && !selectedCurrency;
    const triggerLabel = selectedCurrency
      ? selectedCurrency.code
      : hasUnsupportedValue
        ? `${rawValue} (неподдерживается)`
        : placeholder;

    return (
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
            <span className={cn("truncate", !selectedCurrency && !hasUnsupportedValue && "text-muted-foreground")}>
              {triggerLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder="Поиск по коду или названию" />
            <CommandList>
              <CommandEmpty>Валюта не найдена.</CommandEmpty>
              <CommandGroup>
                {currencyOptions.map((option) => (
                  <CommandItem
                    key={option.code}
                    value={`${option.code} ${option.name} ${option.englishName}`}
                    onSelect={() => {
                      onChange(option.code);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{option.code}</span>
                      <span className="truncate text-xs text-muted-foreground">{option.name}</span>
                    </div>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        selectedCurrency?.code === option.code ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);
CurrencyCombobox.displayName = "CurrencyCombobox";
