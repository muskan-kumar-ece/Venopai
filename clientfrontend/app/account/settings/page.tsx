'use client';

import React, { useState } from 'react';
import { profileApi } from '@/lib/api/client';

export default function SettingsPage() {
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setPwSuccess('');
    setPwError('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await profileApi.changePassword(
        { current_password: currentPassword, new_password: newPassword },
        token
      );
      setPwSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account credentials, security preferences, and verified notification channels.
        </p>
      </div>

      {/* Password Change Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Security & Password</h2>
        <p className="text-xs text-gray-500 mb-4">
          Ensure your account uses a secure password with at least 8 characters including numbers and symbols.
        </p>

        {pwSuccess && (
          <div className="p-3 mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
            {pwSuccess}
          </div>
        )}
        {pwError && (
          <div className="p-3 mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
            {pwError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current Password *</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">New Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Confirm New Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Notification Channel Policy */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Notification Dispatch Policy</h2>
        <p className="text-xs text-gray-500 mb-4">
          Transactional emails are mandatory for quotes, engineering status updates, and shipment tracking to ensure project integrity.
        </p>
        <div className="text-xs text-gray-600 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
          Email channel: <span className="font-semibold text-gray-900">Active (Transactional Only)</span>
          <div className="text-[11px] text-gray-400 mt-1">
            Marketing and promotional emails are disabled in VenopAI V1.
          </div>
        </div>
      </div>
    </div>
  );
}
