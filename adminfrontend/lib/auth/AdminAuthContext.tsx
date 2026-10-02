"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { adminAuthApi, clearAdminTokens } from "@/lib/api/client";

export type AdminRole =
  | "SUPER_ADMIN"
  | "MANUFACTURING_MANAGER"
  | "ORDER_MANAGER"
  | "SUPPORT_EXECUTIVE"
  | "FINANCE_MANAGER";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  status: string;
  role: AdminRole | string;
  is_admin: boolean;
}

interface AdminAuthContextType {
  adminUser: AdminUser | null;
  adminToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AdminUser>;
  logout: () => Promise<void>;
  hasRole: (allowedRoles: string[]) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const ADMIN_TOKEN_KEY = "venopai_admin_token";
const ADMIN_USER_KEY = "venopai_admin_user";

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore and proactively validate session from backend on mount
  useEffect(() => {
    let isMounted = true;

    const restoreAndValidateSession = async () => {
      try {
        const storedToken =
          sessionStorage.getItem(ADMIN_TOKEN_KEY) ||
          sessionStorage.getItem("admin_token") ||
          localStorage.getItem("admin_token");

        if (storedToken) {
          // Proactively validate against backend /admin/auth/me
          try {
            const meRes = await adminAuthApi.me();
            if (isMounted && meRes?.data) {
              setAdminToken(storedToken);
              setAdminUser(meRes.data);
              setIsLoading(false);
              return;
            }
          } catch {
            // Token expired or invalid, try refresh
            try {
              const refreshRes = await adminAuthApi.refresh();
              const newToken = refreshRes?.data?.access_token;
              const newRefreshToken = refreshRes?.data?.refresh_token;
              const newUser = refreshRes?.data?.user;
              if (isMounted && newToken && newUser) {
                setAdminToken(newToken);
                setAdminUser(newUser);
                sessionStorage.setItem(ADMIN_TOKEN_KEY, newToken);
                sessionStorage.setItem("admin_token", newToken);
                localStorage.setItem("admin_token", newToken);
                if (newRefreshToken) {
                  sessionStorage.setItem("venopai_admin_refresh_token", newRefreshToken);
                  sessionStorage.setItem("admin_refresh_token", newRefreshToken);
                  localStorage.setItem("admin_refresh_token", newRefreshToken);
                  localStorage.setItem("venopai_admin_refresh_token", newRefreshToken);
                }
                sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(newUser));
                localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(newUser));
                setIsLoading(false);
                return;
              }
            } catch {
              // Refresh failed too - dead token, clear everything cleanly
              clearAdminTokens();
              if (isMounted) {
                setAdminToken(null);
                setAdminUser(null);
              }
            }
          }
        }
      } catch {
        // ignore storage errors
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreAndValidateSession();

    const handleUnauthorized = () => {
      if (isMounted) {
        setAdminToken(null);
        setAdminUser(null);
        setIsLoading(false);
      }
    };

    const handleRefreshed = (e: any) => {
      if (isMounted) {
        if (e.detail?.token) setAdminToken(e.detail.token);
        if (e.detail?.user) setAdminUser(e.detail.user);
      }
    };

    window.addEventListener("venopai_admin_unauthorized", handleUnauthorized);
    window.addEventListener("venopai_admin_refreshed", handleRefreshed);
    return () => {
      isMounted = false;
      window.removeEventListener("venopai_admin_unauthorized", handleUnauthorized);
      window.removeEventListener("venopai_admin_refreshed", handleRefreshed);
    };
  }, []);

  const login = async (email: string, password: string): Promise<AdminUser> => {
    setIsLoading(true);
    try {
      const res = await adminAuthApi.login({ email, password });
      const token = res.data.access_token;
      const refreshToken = res.data.refresh_token;
      const user: AdminUser = res.data.user;

      setAdminToken(token);
      setAdminUser(user);

      try {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
        sessionStorage.setItem("admin_token", token);
        localStorage.setItem("admin_token", token);
        if (refreshToken) {
          sessionStorage.setItem("venopai_admin_refresh_token", refreshToken);
          sessionStorage.setItem("admin_refresh_token", refreshToken);
          localStorage.setItem("admin_refresh_token", refreshToken);
          localStorage.setItem("venopai_admin_refresh_token", refreshToken);
        }
        sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
      } catch {
        // ignore
      }

      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await adminAuthApi.logout();
    } finally {
      clearAdminTokens();
      setAdminToken(null);
      setAdminUser(null);
      setIsLoading(false);
    }
  };

  const hasRole = useCallback(
    (allowedRoles: string[]): boolean => {
      if (!adminUser) return false;
      if (adminUser.role === "SUPER_ADMIN" || adminUser.is_admin) return true;
      return allowedRoles.includes(adminUser.role);
    },
    [adminUser]
  );

  return (
    <AdminAuthContext.Provider
      value={{
        adminUser,
        adminToken,
        isLoading,
        isAuthenticated: !!adminToken && !!adminUser,
        login,
        logout,
        hasRole,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
