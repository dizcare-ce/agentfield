import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HealthBadge from "@/components/HealthBadge";
import { ModeToggle } from "@/components/ModeToggle";
import { PageHeader } from "@/components/PageHeader";
import { ModeProvider } from "@/contexts/ModeContext";

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/FilterSelect", () => ({
  FilterSelect: ({
    label,
    value,
    onValueChange,
    options,
  }: {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    options: ReadonlyArray<{ label: string; value: string }>;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

vi.mock("@/components/ui/icon-bridge", () => ({
  Code: () => <span>code-icon</span>,
  User: () => <span>user-icon</span>,
}));

describe("general UI components", () => {
  beforeEach(() => {
    let storage: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        clear: () => {
          storage = {};
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("toggles app mode through ModeProvider and persists it", async () => {
    const user = userEvent.setup();
    localStorage.setItem("agentfield-app-mode", "developer");

    render(
      <ModeProvider>
        <ModeToggle />
      </ModeProvider>
    );

    expect(screen.getByRole("button", { name: /Developer/i })).toBeInTheDocument();
    expect(screen.getByTitle("Switch to user mode")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Developer/i }));

    expect(screen.getByRole("button", { name: /User/i })).toBeInTheDocument();
    expect(localStorage.getItem("agentfield-app-mode")).toBe("user");
  });

  it("renders page headers with actions, filters, aside content, and view options", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onFilterChange = vi.fn();

    render(
      <PageHeader
        title="Nodes"
        description="Inspect all registered nodes"
        aside={<span>Aside controls</span>}
        actions={[{ label: "Refresh", onClick: onRefresh }]}
        filters={[
          {
            label: "Status",
            value: "all",
            options: [
              { label: "All", value: "all" },
              { label: "Running", value: "running" },
            ],
            onChange: onFilterChange,
          },
        ]}
        viewOptions={<span>Grid view</span>}
      />
    );

    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("Inspect all registered nodes")).toBeInTheDocument();
    expect(screen.getByText("Aside controls")).toBeInTheDocument();
    expect(screen.getByText("Grid view")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await user.selectOptions(screen.getByLabelText("Status"), "running");

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith("running");
  });

  it("renders health badges for active, inactive, and unknown states", () => {
    const { rerender } = render(<HealthBadge status="active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();

    rerender(<HealthBadge status="inactive" />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();

    rerender(<HealthBadge status={"unexpected" as never} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});
