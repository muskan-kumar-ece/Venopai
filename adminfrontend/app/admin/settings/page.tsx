"use client";

import React, { useState, useEffect } from "react";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import { adminSettingsApi } from "@/lib/api/client";

export default function AdminSettingsPage() {
  const { hasRole, adminToken } = useAdminAuth();
  const isAllowed = hasRole(["SUPER_ADMIN"]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [settings, setSettings] = useState({
    gst_rate: "18.0",
    quote_validity_days: "7",
    free_shipping_threshold: "50000",
    maintenance_mode: false,
    require_email_verification: true,
    notification_retries: "3",
  });

  const [integrations, setIntegrations] = useState<Record<string, boolean>>({
    razorpay: true,
    shiprocket: true,
    resend: true,
    cloudinary: true,
    sentry: true,
  });

  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      if (!isAllowed) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const res = await adminSettingsApi.getSettings();
        if (isMounted && res?.data) {
          const { integrations: remoteIntegrations, ...remoteSettings } = res.data;
          setSettings((prev) => ({
            ...prev,
            ...remoteSettings,
            gst_rate: String(remoteSettings.gst_rate ?? prev.gst_rate),
            quote_validity_days: String(remoteSettings.quote_validity_days ?? prev.quote_validity_days),
            free_shipping_threshold: String(remoteSettings.free_shipping_threshold ?? prev.free_shipping_threshold),
            notification_retries: String(remoteSettings.notification_retries ?? prev.notification_retries),
          }));
          if (remoteIntegrations) {
            setIntegrations(remoteIntegrations);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load system settings");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSettings();
    return () => {
      isMounted = false;
    };
  }, [isAllowed, adminToken]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setErrorMessage("");

    try {
      const res = await adminSettingsApi.updateSettings({
        gst_rate: settings.gst_rate,
        quote_validity_days: settings.quote_validity_days,
        free_shipping_threshold: settings.free_shipping_threshold,
        maintenance_mode: settings.maintenance_mode,
        require_email_verification: settings.require_email_verification,
        notification_retries: settings.notification_retries,
      });

      if (res?.data) {
        const { integrations: remoteIntegrations, ...remoteSettings } = res.data;
        setSettings((prev) => ({ ...prev, ...remoteSettings }));
        if (remoteIntegrations) {
          setIntegrations(remoteIntegrations);
        }
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-red-400">
        Access Restricted: Platform settings require SUPER_ADMIN privileges.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl animate-pulse">
        <div className="h-8 w-64 bg-zinc-800 rounded-lg"></div>
        <div className="h-4 w-96 bg-zinc-800/60 rounded"></div>
        <div className="h-32 bg-zinc-900 rounded-2xl border border-zinc-800 mt-6"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          System & Platform Settings
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Global engineering rules, taxation constants, integration health, and security parameters.
        </p>
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/50 p-4 text-xs font-semibold text-emerald-400">
          Settings successfully saved and audited to platform event ledger.
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-xs font-semibold text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Integration Status Badges */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Integration Infrastructure</h3>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-xl bg-zinc-950 p-3">
            <span className="text-[11px] text-zinc-500">Razorpay</span>
            <div className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${integrations.razorpay ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${integrations.razorpay ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {integrations.razorpay ? "Connected" : "Simulated"}
            </div>
          </div>

          <div className="rounded-xl bg-zinc-950 p-3">
            <span className="text-[11px] text-zinc-500">Shiprocket</span>
            <div className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${integrations.shiprocket ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${integrations.shiprocket ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {integrations.shiprocket ? "Connected" : "Simulated"}
            </div>
          </div>

          <div className="rounded-xl bg-zinc-950 p-3">
            <span className="text-[11px] text-zinc-500">Resend Mail</span>
            <div className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${integrations.resend ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${integrations.resend ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {integrations.resend ? "Connected" : "Simulated"}
            </div>
          </div>

          <div className="rounded-xl bg-zinc-950 p-3">
            <span className="text-[11px] text-zinc-500">Cloudinary</span>
            <div className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${integrations.cloudinary ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${integrations.cloudinary ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {integrations.cloudinary ? "Connected" : "Simulated"}
            </div>
          </div>

          <div className="rounded-xl bg-zinc-950 p-3">
            <span className="text-[11px] text-zinc-500">Sentry Error</span>
            <div className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${integrations.sentry ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${integrations.sentry ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {integrations.sentry ? "Connected" : "Simulated"}
            </div>
          </div>
        </div>
      </div>

      {/* Form Settings */}
      <form onSubmit={handleSave} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Commercial & Production Policies</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-zinc-300">GST Standard Rate (%)</label>
            <input
              type="text"
              value={settings.gst_rate}
              onChange={(e) => setSettings({ ...settings, gst_rate: e.target.value })}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300">Quote Expiration Window (Days)</label>
            <input
              type="text"
              value={settings.quote_validity_days}
              onChange={(e) => setSettings({ ...settings, quote_validity_days: e.target.value })}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300">Free Shipping Threshold (₹)</label>
            <input
              type="text"
              value={settings.free_shipping_threshold}
              onChange={(e) => setSettings({ ...settings, free_shipping_threshold: e.target.value })}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300">Max Notification Retries</label>
            <input
              type="text"
              value={settings.notification_retries}
              onChange={(e) => setSettings({ ...settings, notification_retries: e.target.value })}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving Changes..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
