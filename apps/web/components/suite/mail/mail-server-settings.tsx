/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// hooks
import { useUser } from "@/hooks/store/user";
// services
import { suiteService } from "@/services/suite.service";
// local
import { FormRow, controlClass, errorMessage } from "../common/ui";
import type { TMailSettings } from "../types";

const PRESETS: { label: string; host: string; port: number; security: "tls" | "ssl" | "none" }[] = [
  { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, security: "tls" },
  { label: "Microsoft 365", host: "smtp.office365.com", port: 587, security: "tls" },
  { label: "Amazon SES (us-east-1)", host: "email-smtp.us-east-1.amazonaws.com", port: 587, security: "tls" },
  { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, security: "tls" },
  { label: "Mailgun", host: "smtp.mailgun.org", port: 587, security: "tls" },
  { label: "Zoho", host: "smtp.zoho.com", port: 465, security: "ssl" },
  { label: "Local relay (no auth)", host: "localhost", port: 25, security: "none" },
];

type TForm = Omit<TMailSettings, "id" | "has_password" | "last_tested_at" | "last_test_ok" | "last_test_error"> & {
  password: string;
};

const toForm = (s: TMailSettings): TForm => ({
  is_enabled: s.is_enabled,
  host: s.host,
  port: s.port,
  username: s.username,
  password: "",
  use_tls: s.use_tls,
  use_ssl: s.use_ssl,
  from_email: s.from_email,
  reply_to: s.reply_to,
  notify_work_item_updates: s.notify_work_item_updates,
  notify_invitations: s.notify_invitations,
  notify_team_changes: s.notify_team_changes,
  send_daily_digest: s.send_daily_digest,
  digest_hour_utc: s.digest_hour_utc,
});

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-subtle p-3 hover:bg-layer-1-hover">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex flex-col">
        <span className="text-body-xs-medium text-primary">{label}</span>
        {description && <span className="text-caption-sm-regular text-tertiary">{description}</span>}
      </span>
    </label>
  );
}

export const MailServerSettings = observer(function MailServerSettings({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: user } = useUser();
  const { data, mutate } = useSWR(`SUITE_MAIL_${workspaceSlug}`, () => suiteService.getMailSettings(workspaceSlug));
  const [form, setForm] = useState<TForm | null>(null);
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);
  useEffect(() => {
    if (user?.email && !testTo) setTestTo(user.email);
  }, [user?.email, testTo]);

  if (!form || !data) return <div className="h-64 animate-pulse rounded-xl bg-layer-1" />;

  const set = <K extends keyof TForm>(k: K, v: TForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const security = form.use_ssl ? "ssl" : form.use_tls ? "tls" : "none";

  const save = async () => {
    setSaving(true);
    const { password, ...rest } = form;
    try {
      const saved = await suiteService.updateMailSettings(workspaceSlug, password ? { ...rest, password } : rest);
      await mutate(saved, { revalidate: false });
      setToast({ type: "success", title: "Mail settings saved" });
    } catch (error) {
      setToast({ type: "error", title: "Could not save", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await suiteService.sendTestMail(workspaceSlug, testTo);
      setToast({ type: "success", title: "Test email sent", message: res.message });
    } catch (error) {
      setToast({ type: "error", title: "Test failed", message: errorMessage(error) });
    } finally {
      setTesting(false);
      void mutate();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
          form.is_enabled ? "border-success-strong bg-success-subtle" : "border-subtle bg-surface-1"
        )}
      >
        <div className="flex-1">
          <h3 className="text-body-sm-semibold text-primary">
            {form.is_enabled ? "Using this workspace's mail server" : "Using the instance mail server"}
          </h3>
          <p className="text-body-xs-regular text-secondary">
            {form.is_enabled
              ? "All emails for this workspace are delivered through the SMTP server below."
              : "Emails use the server configured by the instance admin (God mode → Email). Enable to use your own."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-body-xs-medium text-primary">
          <input type="checkbox" checked={form.is_enabled} onChange={(e) => set("is_enabled", e.target.checked)} />
          Use my SMTP server
        </label>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-subtle p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-body-sm-semibold text-primary">SMTP connection</h3>
          <select
            aria-label="Provider preset"
            className={cn(controlClass, "w-auto")}
            value=""
            onChange={(e) => {
              const p = PRESETS.find((x) => x.label === e.target.value);
              if (!p) return;
              setForm((f) =>
                f
                  ? { ...f, host: p.host, port: p.port, use_tls: p.security === "tls", use_ssl: p.security === "ssl" }
                  : f
              );
            }}
          >
            <option value="">Fill from provider…</option>
            {PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_120px_160px]">
          <FormRow label="Host">
            <input
              className={controlClass}
              value={form.host}
              placeholder="smtp.example.com"
              onChange={(e) => set("host", e.target.value)}
            />
          </FormRow>
          <FormRow label="Port">
            <input
              className={controlClass}
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => set("port", Number(e.target.value))}
            />
          </FormRow>
          <FormRow label="Security">
            <select
              className={controlClass}
              value={security}
              onChange={(e) => {
                set("use_tls", e.target.value === "tls");
                set("use_ssl", e.target.value === "ssl");
              }}
            >
              <option value="tls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
              <option value="none">None</option>
            </select>
          </FormRow>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormRow label="Username">
            <input
              className={controlClass}
              autoComplete="off"
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
            />
          </FormRow>
          <FormRow
            label="Password"
            hint={
              data.has_password
                ? "A password is saved. Leave blank to keep it."
                : "Stored encrypted; never shown again."
            }
          >
            <input
              className={controlClass}
              type="password"
              autoComplete="new-password"
              value={form.password}
              placeholder={data.has_password ? "••••••••" : ""}
              onChange={(e) => set("password", e.target.value)}
            />
          </FormRow>
          <FormRow label="From address" hint='e.g. "Acme PMO <pmo@acme.com>"'>
            <input
              className={controlClass}
              value={form.from_email}
              onChange={(e) => set("from_email", e.target.value)}
            />
          </FormRow>
          <FormRow label="Reply-to (optional)">
            <input className={controlClass} value={form.reply_to} onChange={(e) => set("reply_to", e.target.value)} />
          </FormRow>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-subtle p-4">
        <h3 className="text-body-sm-semibold text-primary">What gets emailed</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Toggle
            checked={form.notify_work_item_updates}
            onChange={(v) => set("notify_work_item_updates", v)}
            label="Work item updates"
            description="State changes, comments and mentions on items people follow."
          />
          <Toggle
            checked={form.notify_invitations}
            onChange={(v) => set("notify_invitations", v)}
            label="Invitations"
            description="Workspace and project invitations and additions."
          />
          <Toggle
            checked={form.notify_team_changes}
            onChange={(v) => set("notify_team_changes", v)}
            label="Team changes"
            description="When someone is added to a team."
          />
          <Toggle
            checked={form.send_daily_digest}
            onChange={(v) => set("send_daily_digest", v)}
            label="Daily digest"
            description="Each member gets their overdue, due-soon and in-progress items."
          />
        </div>
        {form.send_daily_digest && (
          <FormRow label="Digest time (UTC hour)">
            <select
              className={cn(controlClass, "w-40")}
              value={form.digest_hour_utc}
              onChange={(e) => set("digest_hour_utc", Number(e.target.value))}
            >
              {Array.from({ length: 24 }).map((_, h) => (
                // oxlint-disable-next-line react/no-array-index-key
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00 UTC
                </option>
              ))}
            </select>
          </FormRow>
        )}
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-subtle p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <FormRow label="Send a test email to">
            <input className={controlClass} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </FormRow>
          {data.last_tested_at && (
            <p
              className={cn(
                "mt-1.5 text-caption-sm-regular",
                data.last_test_ok ? "text-success-primary" : "text-danger-primary"
              )}
            >
              Last test {new Date(data.last_tested_at).toLocaleString()}:{" "}
              {data.last_test_ok ? "delivered" : `failed — ${data.last_test_error}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="md"
            stretch="auto"
            label="Send test"
            loading={testing}
            onClick={() => void test()}
          />
          <Button
            variant="primary"
            size="md"
            stretch="auto"
            label="Save settings"
            loading={saving}
            onClick={() => void save()}
          />
        </div>
      </div>
      <p className="text-caption-sm-regular text-tertiary">
        Save before testing — the test uses the saved server settings.
      </p>
    </div>
  );
});
