import {
  LayoutDashboard,
  Play,
  Server,
  FlaskConical,
  Settings,
  Shield,
  ShieldCheck,
} from "lucide-react";

export const navigation = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
  },
  {
    title: "Runs",
    icon: Play,
    path: "/runs",
  },
  {
    title: "Agents",
    icon: Server,
    path: "/agents",
  },
  {
    title: "Playground",
    icon: FlaskConical,
    path: "/playground",
  },
  {
    title: "Verify",
    icon: ShieldCheck,
    path: "/verify",
  },
  {
    title: "Access management",
    icon: Shield,
    path: "/access",
  },
  {
    title: "Settings",
    icon: Settings,
    path: "/settings",
  },
];
