/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TUpgradeBadge = {
  className?: string;
  size?: "sm" | "md";
};

/**
 * Stratify is fully open source: there are no paid plans, so feature "Pro" badges render nothing.
 * The component is kept so existing call sites keep compiling.
 */
export function UpgradeBadge(_props: TUpgradeBadge) {
  return null;
}
