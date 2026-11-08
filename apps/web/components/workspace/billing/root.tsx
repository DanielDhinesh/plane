/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { BRAND_NAME } from "@plane/constants";
// components
import { SettingsHeading } from "@/components/settings/heading";

const INCLUDED = [
  { title: "Unlimited everything", body: "Unlimited members, guests, projects, work items, storage and history." },
  { title: "Teams", body: "Group people and projects into teams and filter any view by team." },
  { title: "Jira-style workflows", body: "Define allowed state transitions per project, restricted by role." },
  { title: "Knowledge base", body: "Confluence-style spaces with nested pages, locking and version history." },
  { title: "Sheets", body: "A workspace-wide spreadsheet of every work item with rich filters and CSV export." },
  {
    title: "Bulk operations",
    body: "Select many work items and change state, priority, dates, labels or assignees at once.",
  },
  { title: "Industry templates", body: "Start projects from Scrum, ITSM, CRM, HR, construction, finance and more." },
  { title: "Your own mail server", body: "Send updates, invitations and daily digests through your SMTP server." },
  { title: "Time, point and category estimates", body: "Every estimate system is available on every project." },
  { title: "Active cycles overview", body: "See every running cycle across projects with live progress." },
];

/** Replaces the upstream plans page: Stratify is free and open source, with nothing behind a paywall. */
export const BillingRoot = observer(function BillingRoot() {
  return (
    <section className="relative scrollbar-hide size-full overflow-y-auto">
      <SettingsHeading
        title={`${BRAND_NAME} is open source`}
        description="There are no plans, seats or limits. Every feature below is included for every workspace, forever."
      />
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {INCLUDED.map((item) => (
          <div key={item.title} className="rounded-lg border border-subtle bg-layer-1 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-success-subtle text-caption-sm-semibold text-success-primary">
                ✓
              </span>
              <h4 className="text-body-sm-semibold text-primary">{item.title}</h4>
            </div>
            <p className="mt-1.5 text-body-xs-regular text-secondary">{item.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-body-xs-regular text-tertiary">
        {BRAND_NAME} is licensed under the GNU AGPL v3 and builds on the Plane Community Edition.
      </p>
    </section>
  );
});
