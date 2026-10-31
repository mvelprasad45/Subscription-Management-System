import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { authApi } from "./api.js";

const AuthContext = createContext(null);

function isValidAdminSession() {
  const token = localStorage.getItem("brightloop_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "ADMIN" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [checking, setChecking] = useState(isValidAdminSession);
  const [authenticated, setAuthenticated] = useState(false);
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem("brightloop_admin") || "null"); }
    catch { return null; }
  });

  useEffect(() => {
    if (!isValidAdminSession()) {
      setChecking(false);
      setAuthenticated(false);
      return undefined;
    }

    let active = true;
    authApi.me()
      .then(({ admin: verifiedAdmin }) => {
        if (!active) return;
        localStorage.setItem("brightloop_admin", JSON.stringify(verifiedAdmin));
        setAdmin(verifiedAdmin);
        setAuthenticated(true);
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem("brightloop_token");
        localStorage.removeItem("brightloop_admin");
        setAdmin(null);
        setAuthenticated(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    const logout = () => {
      setAuthenticated(false);
      setAdmin(null);
      setChecking(false);
    };
    window.addEventListener("brightloop:logout", logout);
    return () => {
      active = false;
      window.removeEventListener("brightloop:logout", logout);
    };
  }, []);

  const value = useMemo(() => ({
    authenticated,
    checking,
    admin,
    async login(credentials) {
      const session = await authApi.login(credentials);
      localStorage.setItem("brightloop_token", session.token);
      localStorage.setItem("brightloop_admin", JSON.stringify(session.admin));
      setAdmin(session.admin);
      setChecking(false);
      setAuthenticated(true);
    },
    logout() {
      localStorage.removeItem("brightloop_token");
      localStorage.removeItem("brightloop_admin");
      setAdmin(null);
      setChecking(false);
      setAuthenticated(false);
    },
  }), [admin, authenticated, checking]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAdmin({ children }) {
  const auth = useAuth();
  if (auth.checking) return <div className="min-h-screen bg-[#c9c3ea] p-5"><div className="app-shell mx-auto h-64 max-w-5xl animate-pulse rounded-[32px]" /></div>;
  return auth.authenticated ? children : <Navigate to="/login" replace />;
}

export function LoginRedirect() {
  const auth = useAuth();
  if (auth.checking) return null;
  return <Navigate to={auth.authenticated ? "/products" : "/login"} replace />;
}

export function useLogout() {
  const auth = useAuth();
  const navigate = useNavigate();
  return () => {
    auth.logout();
    navigate("/login", { replace: true });
  };
}
