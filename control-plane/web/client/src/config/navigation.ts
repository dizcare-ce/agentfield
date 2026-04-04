import {
  LayoutDashboard,
  Play,
  Server,
  FlaskConical,
  Settings,
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
    title: "Settings",
    icon: Settings,
    path: "/settings",
  },
];
