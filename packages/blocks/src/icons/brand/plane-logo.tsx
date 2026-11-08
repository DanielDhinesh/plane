/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

export type PlaneLogoProps = React.ComponentPropsWithoutRef<"svg">;

/**
 * Product brand mark (Velora "speed V").
 * The export name is kept as `PlaneLogo` so existing imports keep working; prefer `BrandLogo` in new code.
 */
export function PlaneLogo({ width = "85", height = "52", className, color = "currentColor" }: PlaneLogoProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 85 52"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Velora"
    >
      {/* motion streaks */}
      <path d="M2 10H16L13 16H0L2 10Z" fill={color} opacity="0.45" />
      <path d="M6 22H19L16 28H4L6 22Z" fill={color} opacity="0.7" />
      {/* the V */}
      <path d="M20 2H35L48.5 33L62 2H85L58 50H40L20 2Z" fill={color} />
    </svg>
  );
}

export { PlaneLogo as BrandLogo };
