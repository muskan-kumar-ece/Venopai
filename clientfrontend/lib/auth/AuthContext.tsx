"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, isValidToken, getCustomerToken, clearCustomerTokens } from "@/lib/api/client";

export interface User {
  id: string;
  email: string;
  full_name: string;
  status: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isVerified: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; full_name: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "venopai_customer_token";
const USER_KEY = "venopai_customer_user";

function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    if (raw && raw !== "undefined" && raw !== "null") {
      return JSON.parse(raw);
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session from sessionStorage or localStorage on mount
  useEffect(() => {
    try {
      const storedToken = getCustomerToken();
      const storedUser = getStoredUser();
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(storedUser);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for unauthorized and refreshed events emitted by apiClient
  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
    };
    const handleRefreshed = () => {
      const storedToken = getCustomerToken();
      const storedUser = getStoredUser();
      if (storedToken) setToken(storedToken);
      if (storedUser) setUser(storedUser);
    };
    window.addEventListener("venopai_auth_unauthorized", handleUnauthorized);
    window.addEventListener("venopai_auth_refreshed", handleRefreshed);
    return () => {
      window.removeEventListener("venopai_auth_unauthorized", handleUnauthorized);
      window.removeEventListener("venopai_auth_refreshed", handleRefreshed);
    };
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.login({ email, password });
      const accessToken = res.data.access_token;
      const userData: User = res.data.user;

      setToken(accessToken);
      setUser(userData);

      try {
        sessionStorage.setItem(TOKEN_KEY, accessToken);
        sessionStorage.setItem("access_token", accessToken);
        sessionStorage.setItem(USER_KEY, JSON.stringify(userData));
        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem("access_token", accessToken);
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
      } catch {
        // ignore storage errors
      }

      return userData;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: { email: string; password: string; full_name: string; phone?: string }): Promise<void> => {
    setIsLoading(true);
    try {
      await authApi.register(data);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authApi.logout().catch(() => {});
    } finally {
      clearCustomerTokens();
      setToken(null);
      setUser(null);
      setIsLoading(false);
    }
  };

  const refreshUser = useCallback(async (): Promise<void> => {
    if (!token) return;
    try {
      const res = await authApi.getMe(token);
      if (res?.data) {
        setUser(res.data);
        try {
          sessionStorage.setItem(USER_KEY, JSON.stringify(res.data));
          localStorage.setItem(USER_KEY, JSON.stringify(res.data));
        } catch {
          // ignore
        }
      }
    } catch {
      // if invalid, clear
      logout();
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        isVerified: user?.status === "verified",
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
