/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

/** Shared form-control styling for native inputs used across the suite pages (theme aware). */
export const controlClass =
  "h-9 w-full min-w-0 rounded-md border border-subtle bg-surface-1 px-2.5 text-body-xs-regular text-primary placeholder:text-placeholder outline-none transition-colors focus:border-accent-strong disabled:opacity-60";

export const textareaClass = cn(controlClass, "h-auto min-h-[84px] py-2 leading-5");

export const SWATCHES = [
  "#3F76FF",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#22C55E",
  "#14B8A6",
  "#64748B",
];

export function FormRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-xs-medium text-secondary">{label}</span>
      {children}
      {hint && <span className="text-caption-sm-regular text-tertiary">{hint}</span>}
    </label>
  );
}

export function SwatchPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className={cn(
            "size-6 rounded-full border-2 transition-transform hover:scale-110",
            value === color ? "border-primary" : "border-transparent"
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function Initials({ name, color, className }: { name: string; color?: string; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      className={cn(
        "grid size-8 flex-shrink-0 place-items-center rounded-md text-caption-sm-semibold text-white",
        className
      )}
      style={{ backgroundColor: color ?? "#64748B" }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function EmptyPanel({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-subtle px-6 py-12 text-center">
      {icon && <div className="grid size-12 place-items-center rounded-full bg-layer-2 text-tertiary">{icon}</div>}
      <h3 className="text-h5-semibold text-primary">{title}</h3>
      <p className="text-body-xs-regular text-secondary">{description}</p>
      {action}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-h4-semibold text-primary">{title}</h2>
        {description && <p className="mt-1 text-body-xs-regular text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Extracts a readable message from an API error payload. */
export const errorMessage = (error: unknown, fallback = "Something went wrong. Please try again.") => {
  if (!error || typeof error !== "object") return fallback;
  const e = error as Record<string, unknown>;
  if (typeof e.error === "string") return e.error;
  const first = Object.entries(e)[0];
  if (first) {
    const [field, value] = first;
    const msg = Array.isArray(value) ? value[0] : value;
    if (typeof msg === "string") return field === "non_field_errors" ? msg : `${field}: ${msg}`;
  }
  return fallback;
};
