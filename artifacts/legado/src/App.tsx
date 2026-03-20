import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useAuth, getAdminAuthToken } from "@/hooks/use-auth";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import Dashboard from "@/pages/dashboard";
import LegacyList from "@/pages/legacy/index";
import LegacyForm from "@/pages/legacy/form";
import Recipients from "@/pages/recipients/index";
import TrustedContacts from "@/pages/trusted-contacts/index";
import FuneralPreferences from "@/pages/funeral/index";
import ActivationSettings from "@/pages/activation/index";
import AccessPortal from "@/pages/access/portal";
import MediaPage from "@/pages/media/index";
import ProfilePage from "@/pages/profile/index";

import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminReportDetail from "@/pages/admin/report-detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <Component />;
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) return null;
  if (isAuthenticated) return null;

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const [_, setLocation] = useLocation();
  const hasToken = !!getAdminAuthToken();

  useEffect(() => {
    if (!hasToken) {
      setLocation("/admin/login");
    }
  }, [hasToken]);

  if (!hasToken) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login"><PublicOnlyRoute component={Login} /></Route>
      <Route path="/register"><PublicOnlyRoute component={Register} /></Route>

      <Route path="/access/:token" component={AccessPortal} />

      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/legacy"><ProtectedRoute component={LegacyList} /></Route>
      <Route path="/legacy/new"><ProtectedRoute component={LegacyForm} /></Route>
      <Route path="/legacy/:id"><ProtectedRoute component={LegacyForm} /></Route>
      <Route path="/recipients"><ProtectedRoute component={Recipients} /></Route>
      <Route path="/trusted-contacts"><ProtectedRoute component={TrustedContacts} /></Route>
      <Route path="/funeral"><ProtectedRoute component={FuneralPreferences} /></Route>
      <Route path="/activation"><ProtectedRoute component={ActivationSettings} /></Route>
      <Route path="/media"><ProtectedRoute component={MediaPage} /></Route>
      <Route path="/profile"><ProtectedRoute component={ProfilePage} /></Route>

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin"><AdminRoute component={AdminDashboard} /></Route>
      <Route path="/admin/death-reports/:id"><AdminRoute component={AdminReportDetail} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
