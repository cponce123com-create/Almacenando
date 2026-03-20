import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

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

// Admin
import AdminDashboard from "@/pages/admin/dashboard";
import AdminReportDetail from "@/pages/admin/report-detail";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  if (isLoading) return <div className="h-screen w-full bg-background"></div>;

  if (!isAuthenticated) {
    setLocation("/login");
    return null;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      {/* Recipient Portal (Public via token) */}
      <Route path="/access/:token" component={AccessPortal} />

      {/* Protected User Routes */}
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/legacy"><ProtectedRoute component={LegacyList} /></Route>
      <Route path="/legacy/:id"><ProtectedRoute component={LegacyForm} /></Route>
      <Route path="/recipients"><ProtectedRoute component={Recipients} /></Route>
      <Route path="/trusted-contacts"><ProtectedRoute component={TrustedContacts} /></Route>
      <Route path="/funeral"><ProtectedRoute component={FuneralPreferences} /></Route>
      <Route path="/activation"><ProtectedRoute component={ActivationSettings} /></Route>

      {/* Admin Routes (Simplified for MVP, would normally have admin auth wrapper) */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/death-reports/:id" component={AdminReportDetail} />

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
