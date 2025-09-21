// src/context/AuthContext.tsx
import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";

type User = {
  id?: string;
  name?: string;
  email?: string;
  // add other fields you need
} | null;

type AuthContextType = {
  user: User;
  login: (u: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);

  // Example: restore user from localStorage/session on mount (adjust to your auth)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("app_user");
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (user) localStorage.setItem("app_user", JSON.stringify(user));
      else localStorage.removeItem("app_user");
    } catch {
      /* ignore */
    }
  }, [user]);

  const login = (u: User) => setUser(u);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // exact error message preserved for compatibility with existing checks
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
