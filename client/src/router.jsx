import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthProvider, RequireAdmin, LoginRedirect } from "./lib/auth.jsx";
import { AppLayout } from "./components/AppLayout.jsx";

const LoginPage = lazy(() => import("./pages/LoginPage.jsx").then((module) => ({ default: module.LoginPage })));
const ProductsPage = lazy(() => import("./pages/ProductsPage.jsx").then((module) => ({ default: module.ProductsPage })));
const ProductFormPage = lazy(() => import("./pages/ProductFormPage.jsx").then((module) => ({ default: module.ProductFormPage })));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage.jsx").then((module) => ({ default: module.TemplatesPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx").then((module) => ({ default: module.DashboardPage })));

function LoadPage({ children }) {
  return <Suspense fallback={<div className="glass-card h-64 animate-pulse rounded-2xl" />}>{children}</Suspense>;
}

function Protected({ children }) {
  return <AuthProvider><RequireAdmin>{children}</RequireAdmin></AuthProvider>;
}

function PublicRoute({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <PublicRoute><LoadPage><LoginPage /></LoadPage></PublicRoute>,
  },
  {
    path: "/",
    element: <Protected><AppLayout /></Protected>,
    children: [
      { index: true, element: <Navigate to="/products" replace /> },
      { path: "dashboard", element: <LoadPage><DashboardPage /></LoadPage> },
      { path: "products", element: <LoadPage><ProductsPage /></LoadPage> },
      { path: "products/new", element: <LoadPage><ProductFormPage /></LoadPage> },
      { path: "products/:id/edit", element: <LoadPage><ProductFormPage /></LoadPage> },
      { path: "templates", element: <LoadPage><TemplatesPage /></LoadPage> },
    ],
  },
  { path: "*", element: <PublicRoute><LoginRedirect /></PublicRoute> },
]);
