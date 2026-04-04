import {
  LayoutDashboard,
  Play,
  Server,
  FlaskConical,
  Settings,
  KeyRound,
  FileCheck2,
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
    title: "Access management",
    icon: KeyRound,
    path: "/access",
  },
  {
    title: "Audit",
    icon: FileCheck2,
    path: "/verify",
  },
  {
    title: "Settings",
    icon: Settings,
    path: "/settings",
  },
];
