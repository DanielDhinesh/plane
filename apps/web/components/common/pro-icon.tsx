/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TProIcon = {
  className?: string;
};

/** Every feature is included in Stratify, so the paid-feature marker renders nothing. */
export function ProIcon(_props: TProIcon) {
  return null;
}
