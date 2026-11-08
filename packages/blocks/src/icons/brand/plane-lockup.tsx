/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

export type PlaneLockupProps = React.ComponentPropsWithoutRef<"svg">;

/**
 * Product brand lockup (mark + "Stratify" wordmark).
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
      aria-label="Stratify"
    >
      {/* mark */}
      <g transform="translate(0 0.5)">
        {/* three rising strata */}
        <path d="M14 52L20 40H58L52 52H14Z" fill={color} opacity="0.5" />
        <path d="M24 34L30 22H68L62 34H24Z" fill={color} opacity="0.75" />
        <path d="M34 16L40 4H85L79 16H34Z" fill={color} />
      </g>
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
        Stratify
      </text>
    </svg>
  );
}

export { PlaneLockup as BrandLockup };
