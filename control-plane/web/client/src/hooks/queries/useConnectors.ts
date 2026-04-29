import { useQuery } from "@tanstack/react-query";
import type {
  Connector,
  ConnectorDetail,
  ConnectorInvocation,
} from "@/types/agentfield";

const API_BASE = "/api/v1";

async function fetchConnectors(): Promise<{ connectors: Connector[] }> {
  const response = await fetch(`${API_BASE}/connectors`);
  if (!response.ok) {
    throw new Error(`Failed to fetch connectors: ${response.statusText}`);
  }
  return response.json();
}

async function fetchConnectorDetail(name: string): Promise<ConnectorDetail> {
  const response = await fetch(`${API_BASE}/connectors/${name}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch connector: ${response.statusText}`);
  }
  return response.json();
}

async function fetchConnectorIcon(name: string): Promise<string | { lucide: string }> {
  const response = await fetch(`${API_BASE}/connectors/${name}/icon`);
  if (!response.ok) {
    return response.json().catch(() => ({ lucide: "Webhook" }));
  }
  return response.text();
}

async function fetchConnectorInvocations(
  limit?: number
): Promise<{ invocations: ConnectorInvocation[] }> {
  const url = new URL(`${API_BASE}/connectors/_invocations`, window.location.origin);
  if (limit) url.searchParams.set("limit", limit.toString());
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch invocations: ${response.statusText}`);
  }
  return response.json();
}

export function useConnectors() {
  return useQuery({
    queryKey: ["connectors"],
    queryFn: fetchConnectors,
    staleTime: 30_000,
  });
}

export function useConnectorDetail(name: string) {
  return useQuery({
    queryKey: ["connector", name],
    queryFn: () => fetchConnectorDetail(name),
    enabled: !!name,
    staleTime: 30_000,
  });
}

export function useConnectorIcon(name: string) {
  return useQuery({
    queryKey: ["connector-icon", name],
    queryFn: () => fetchConnectorIcon(name),
    enabled: !!name,
    staleTime: 60_000,
  });
}

export function useConnectorInvocations(limit = 50) {
  return useQuery({
    queryKey: ["connector-invocations", limit],
    queryFn: () => fetchConnectorInvocations(limit),
    staleTime: 15_000,
  });
}

export async function invokeConnectorOperation(
  connectorName: string,
  operationName: string,
  inputs: Record<string, unknown>
) {
  const response = await fetch(
    `${API_BASE}/connectors/${connectorName}/${operationName}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw data;
  }

  return data;
}
