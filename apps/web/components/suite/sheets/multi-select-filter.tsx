/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@plane/utils";

export type TFilterOption = { value: string; label: string; color?: string; hint?: string };

type Props = {
  label: string;
  options: TFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  searchable?: boolean;
};

/** Compact dropdown with a searchable checkbox list, used by the Sheets filter bar. */
export function MultiSelectFilter({ label, options, value, onChange, searchable = true }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 max-w-[14rem] items-center gap-1.5 rounded-md border px-2.5 text-body-xs-medium transition-colors",
          value.length
            ? "border-accent-strong bg-accent-primary/10 text-accent-primary"
            : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1-hover"
        )}
      >
        <span className="flex-shrink-0">{label}</span>
        {value.length > 0 && (
          <span className="truncate text-caption-sm-regular">
            : {selectedLabels.length <= 2 ? selectedLabels.join(", ") : `${selectedLabels.length} selected`}
          </span>
        )}
        <span aria-hidden className="text-caption-sm-regular">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute top-9 left-0 z-20 w-64 rounded-lg border border-subtle bg-surface-1 p-1.5 shadow-raised-200"
        >
          {searchable && options.length > 6 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
              className="mb-1 h-8 w-full rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary outline-none focus:border-accent-strong"
            />
          )}
          <div className="max-h-64 overflow-y-auto">
            {shown.length === 0 && (
              <p className="px-2 py-3 text-center text-caption-sm-regular text-tertiary">No options</p>
            )}
            {shown.map((option) => {
              const checked = value.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body-xs-regular text-primary hover:bg-layer-1-hover"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange(checked ? value.filter((v) => v !== option.value) : [...value, option.value])
                    }
                  />
                  {option.color && (
                    <span className="size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
                  )}
                  <span className="truncate">{option.label}</span>
                  {option.hint && (
                    <span className="ml-auto flex-shrink-0 text-caption-sm-regular text-tertiary">{option.hint}</span>
                  )}
                </label>
              );
            })}
          </div>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-caption-sm-medium text-tertiary hover:bg-layer-1-hover"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
