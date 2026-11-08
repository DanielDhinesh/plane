/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

export type PlaneLockupProps = React.ComponentPropsWithoutRef<"svg">;

/**
 * Product brand lockup (mark + "Velora" wordmark).
 * The export name is kept as `PlaneLockup` so existing imports keep working; prefer `BrandLockup` in new code.
 */
export function PlaneLockup({ width = "253", height = "53", className, color = "currentColor" }: PlaneLockupProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 253 53"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Velora"
    >
      {/* mark */}
      <path d="M2 11H16L13 17H0L2 11Z" fill={color} opacity="0.45" />
      <path d="M6 23H19L16 29H4L6 23Z" fill={color} opacity="0.7" />
      <path d="M20 3H35L48.5 34L62 3H85L58 51H40L20 3Z" fill={color} />
      {/* wordmark */}
      <text
        x="96"
        y="43"
        fill={color}
        fontFamily="Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="44"
        fontWeight="800"
        letterSpacing="-1.5"
      >
        Velora
      </text>
    </svg>
  );
}

export { PlaneLockup as BrandLockup };
