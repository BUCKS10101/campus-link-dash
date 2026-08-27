import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AppShell } from "@/components/shell";
import { LoadingRegion } from "@/components/primitives";
import { AuthProvider } from "@/hooks/useAuth";
import { NotificationsProvider } from "@/hooks/useNotifications";

// Login stays eager: it is the cold-start destination for every signed-out
// visitor (ProtectedRoute redirects there), so lazy-loading it would cost
// that path a second sequential round trip.
import Login from "./pages/Login";

// Everything behind auth is split per route.
const Home = lazy(() => import("./pages/Home"));
const PostRequest = lazy(() => import("./pages/PostRequest"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const Profile = lazy(() => import("./pages/Profile"));
const Friends = lazy(() => import("./pages/Friends"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {/* One shared auth listener for the whole app - see useAuth.tsx
                for why per-component listeners caused both duplicate
                profile fetches and a real deadlock on reload. */}
            <AuthProvider>
            {/* Needs useAuth(), so nested inside AuthProvider - only
                subscribes/fetches while a user is signed in (see
                useNotifications.tsx). */}
            <NotificationsProvider>
              <Suspense fallback={<LoadingRegion label="Loading CampusLink" />}>
                <Routes>
                  <Route path="/login" element={<Login />} />

                  {/* Every route below shares one auth guard and one
                      application shell (nav, page frame) — mounted once
                      here rather than imported per page. */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/" element={<Home />} />
                    <Route path="/post-request" element={<PostRequest />} />
                    <Route path="/my-orders" element={<MyOrders />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/friends" element={<Friends />} />
                    <Route path="/settings" element={<Settings />} />
                  </Route>

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </NotificationsProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
