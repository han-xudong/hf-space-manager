import { ConnectionOnboardingDialog } from "@/components/connection-onboarding-dialog";
import { AppNavigation } from "@/components/app-navigation";

type AppShellProps = {
  needsConnectionSetup: boolean;
  children: React.ReactNode;
};

export function AppShell({ needsConnectionSetup, children }: AppShellProps) {
  return (
    <div className="app-frame" suppressHydrationWarning>
      <header className="shell-header">
        <div className="brand-block">
          <p className="brand-title">HUGGING FACE SPACE MANAGER</p>
          <p className="brand-subtitle">monitor space operations</p>
        </div>

        <AppNavigation />
      </header>

      <div className="shell-main">
        <main className="page-grid">{children}</main>
      </div>

      <ConnectionOnboardingDialog open={needsConnectionSetup} />
    </div>
  );
}