import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Play,
  Server,
  FlaskConical,
  KeyRound,
  FileCheck2,
  Settings,
  Search,
  Sparkles,
} from "lucide-react";
import { useDemoMode } from "@/demo/hooks/useDemoMode";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isDemoMode, actions: demoActions } = useDemoMode();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      // Cmd+Shift+D: toggle demo mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "d") {
        e.preventDefault();
        if (isDemoMode) {
          demoActions.deactivateDemo();
        } else {
          demoActions.setAct(0);
          demoActions.activateDemo("saas");
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isDemoMode, demoActions]);

  const runAction = useCallback((action: () => void) => {
    setOpen(false);
    action();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, runs, agents..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runAction(() => navigate("/dashboard"))}
          >
            <LayoutDashboard className="mr-2 size-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => navigate("/runs"))}>
            <Play className="mr-2 size-4" />
            Runs
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => navigate("/agents"))}>
            <Server className="mr-2 size-4" />
            Agent nodes
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => navigate("/playground"))}
          >
            <FlaskConical className="mr-2 size-4" />
            Playground
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => navigate("/access"))}
          >
            <KeyRound className="mr-2 size-4" />
            Access management
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => navigate("/verify"))}
          >
            <FileCheck2 className="mr-2 size-4" />
            Audit
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => navigate("/settings"))}
          >
            <Settings className="mr-2 size-4" />
            Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Demo">
          <CommandItem
            onSelect={() =>
              runAction(() => {
                if (isDemoMode) {
                  demoActions.deactivateDemo();
                } else {
                  demoActions.setAct(0);
                  demoActions.activateDemo("saas");
                }
              })
            }
          >
            <Sparkles className="mr-2 size-4" />
            {isDemoMode ? "Exit demo mode" : "Enter demo mode"}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() =>
              runAction(() => navigate("/runs?status=failed"))
            }
          >
            <Search className="mr-2 size-4" />
            Show failed runs
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runAction(() => navigate("/runs?status=running"))
            }
          >
            <Search className="mr-2 size-4" />
            Show running executions
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => navigate("/settings"))}
          >
            <Settings className="mr-2 size-4" />
            Configure webhooks
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
