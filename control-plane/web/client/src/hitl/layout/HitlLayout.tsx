import { Link, Outlet } from "react-router-dom";
import { HitlResponderBanner } from "../components/HitlResponderBanner";

export function HitlLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/hitl" className="font-semibold">
            AgentField · HITL
          </Link>
          <HitlResponderBanner />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-3xl px-6 py-6 text-xs text-muted-foreground">
        <Link to="/ui" className="hover:underline">
          ← Back to developer UI
        </Link>
      </footer>
    </div>
  );
}
