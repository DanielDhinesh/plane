/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

export type PlaneLogoProps = React.ComponentPropsWithoutRef<"svg">;

/**
 * Product brand mark (Stratify "rising strata").
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
      aria-label="Stratify"
    >
      {/* three rising strata */}
      <path d="M14 52L20 40H58L52 52H14Z" fill={color} opacity="0.5" />
      <path d="M24 34L30 22H68L62 34H24Z" fill={color} opacity="0.75" />
      <path d="M34 16L40 4H85L79 16H34Z" fill={color} />
    </svg>
  );
}

export { PlaneLogo as BrandLogo };
