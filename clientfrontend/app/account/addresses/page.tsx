'use client';

import React, { useEffect, useState } from 'react';
import { addressesApi } from '@/lib/api/client';
import { LoadingState } from '@/components/account/LoadingState';
import { EmptyState } from '@/components/account/EmptyState';

interface Address {
  id: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form modal/drawer state
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    recipient_name: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAddresses = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      const res = await addressesApi.listAddresses(token);
      if (res?.data) {
        setAddresses(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const openCreateModal = () => {
    setEditId(null);
    setFormValues({
      recipient_name: '',
      phone: '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      pincode: '',
      is_default: addresses.length === 0,
    });
    setFormError(null);
    setIsEditing(true);
  };

  const openEditModal = (addr: Address) => {
    setEditId(addr.id);
    setFormValues({
      recipient_name: addr.recipient_name,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      is_default: addr.is_default,
    });
    setFormError(null);
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      if (editId) {
        await addressesApi.updateAddress(editId, formValues, token);
      } else {
        await addressesApi.createAddress(formValues, token);
      }
      setIsEditing(false);
      loadAddresses();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save address');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this address?')) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await addressesApi.deleteAddress(id, token);
      loadAddresses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete address');
    }
  };

  const handleSetDefault = async (addr: Address) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
      await addressesApi.updateAddress(addr.id, { is_default: true }, token);
      loadAddresses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to set default address');
    }
  };

  if (loading) {
    return <LoadingState message="Loading saved addresses..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saved Addresses</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your domestic delivery addresses for hardware orders and prototype shipments.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
        >
          + Add New Address
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {addresses.length === 0 ? (
        <EmptyState
          title="No addresses saved"
          message="Add a shipping address to receive manufactured hardware, PCBs, and parts."
          actionLabel="Add Address"
          actionHref="#create"
          icon="📍"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`bg-white border rounded-xl p-5 shadow-sm relative transition ${
                addr.is_default ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 text-base">{addr.recipient_name}</h3>
                    {addr.is_default && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{addr.phone}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(addr)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium ml-2"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-700 space-y-0.5">
                <div>{addr.line1}</div>
                {addr.line2 && <div>{addr.line2}</div>}
                <div>
                  {addr.city}, {addr.state} - <span className="font-medium">{addr.pincode}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">India (Domestic Only)</div>
              </div>

              {!addr.is_default && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={() => handleSetDefault(addr)}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
                  >
                    Set as default address
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Address Form Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editId ? 'Edit Address' : 'Add New Address'}
              </h2>
              <button
                onClick={() => setIsEditing(false)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Recipient Name *</label>
                <input
                  type="text"
                  required
                  value={formValues.recipient_name}
                  onChange={(e) => setFormValues({ ...formValues, recipient_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Muskan Kumar"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number (10-digit India) *</label>
                <input
                  type="text"
                  required
                  value={formValues.phone}
                  onChange={(e) => setFormValues({ ...formValues, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="9876543210"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Address Line 1 *</label>
                <input
                  type="text"
                  required
                  value={formValues.line1}
                  onChange={(e) => setFormValues({ ...formValues, line1: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Plot 42, Electronics City Phase 1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Address Line 2 (Optional)</label>
                <input
                  type="text"
                  value={formValues.line2}
                  onChange={(e) => setFormValues({ ...formValues, line2: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Near Tech Hub, Floor 3"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={formValues.city}
                    onChange={(e) => setFormValues({ ...formValues, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Bengaluru"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={formValues.state}
                    onChange={(e) => setFormValues({ ...formValues, state: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Karnataka"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">PIN Code (6 Digits) *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={formValues.pincode}
                  onChange={(e) => setFormValues({ ...formValues, pincode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="560100"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formValues.is_default}
                  onChange={(e) => setFormValues({ ...formValues, is_default: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="is_default" className="text-xs text-gray-700 font-medium">
                  Set as default shipping address
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
