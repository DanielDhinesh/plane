/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Lazily loads one translation namespace.
 *
 * This file must stay directly under `src/`: the bundle is emitted as `dist/index.js` and
 * `tsdown.config.ts` copies `src/locales` to `dist/locales`, so `./locales/...` resolves to the
 * same layout from source and from the build. Consumers (Vite apps) turn this variable import
 * into a glob over `./locales/*\/*.json`, which is empty if the path points anywhere else.
 */
export const loadLocaleNamespace = (language: string, namespace: string) =>
  import(`./locales/${language}/${namespace}.json`);
