/**
 * Gradually expanding DAG simulation for demo mode.
 * Adds nodes one at a time to simulate a run in progress.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_TIMING } from '../constants';
import type { WorkflowDAGLightweightNode } from '../../types/workflows';
import { generateId, generateDuration, randomBetween } from '../mock/shared';
import type { DemoDAGTopology } from '../mock/types';

interface UseDemoDAGOptions {
  /** Whether the DAG expansion is active */
  enabled: boolean;
  /** The full topology to gradually reveal */
  topology: DemoDAGTopology;
  /** Callback when the run "completes" */
  onComplete?: () => void;
}

interface UseDemoDAGReturn {
  /** Currently visible nodes (grows over time) */
  nodes: WorkflowDAGLightweightNode[];
  /** Whether the DAG is still expanding */
  isExpanding: boolean;
  /** Reset to start over */
  reset: () => void;
}

function edgeToNode(
  edge: DemoDAGTopology['edges'][number],
  index: number,
  status: string,
): WorkflowDAGLightweightNode {
  const [parentReasonerId, reasonerId, agentNodeId] = edge;
  const durationMs = status === 'running' ? undefined : generateDuration(200, 3000);
  const startedAt = new Date(Date.now() - randomBetween(1000, 5000)).toISOString();
  const completedAt = status === 'running' ? undefined : new Date().toISOString();

  return {
    execution_id: `exec-${reasonerId}-${generateId().slice(0, 6)}`,
    parent_execution_id: parentReasonerId ? `exec-${parentReasonerId}` : undefined,
    agent_node_id: agentNodeId,
    reasoner_id: reasonerId,
    status,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    workflow_depth: index, // simplified — real depth computed from parent chain
  };
}

export function useDemoDAG({
  enabled,
  topology,
  onComplete,
}: UseDemoDAGOptions): UseDemoDAGReturn {
  const [nodes, setNodes] = useState<WorkflowDAGLightweightNode[]>([]);
  const [isExpanding, setIsExpanding] = useState(false);
  const currentIndex = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const addNextNode = useCallback(() => {
    if (!enabledRef.current) return;
    if (currentIndex.current >= topology.edges.length) {
      // All nodes revealed — mark last as succeeded and complete
      setNodes((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.status === 'running') {
          updated[updated.length - 1] = {
            ...last,
            status: 'succeeded',
            completed_at: new Date().toISOString(),
            duration_ms: generateDuration(200, 2000),
          };
        }
        return updated;
      });
      setIsExpanding(false);
      onComplete?.();
      return;
    }

    const edge = topology.edges[currentIndex.current];
    const isLast = currentIndex.current === topology.edges.length - 1;

    // Mark previous "running" node as succeeded
    setNodes((prev) => {
      const updated = prev.map((n) =>
        n.status === 'running'
          ? { ...n, status: 'succeeded', completed_at: new Date().toISOString(), duration_ms: generateDuration(200, 2000) }
          : n,
      );
      // Add new node as "running"
      const newNode = edgeToNode(edge, currentIndex.current, isLast ? 'running' : 'running');
      return [...updated, newNode];
    });

    currentIndex.current += 1;

    // Schedule next
    if (!isLast) {
      timerRef.current = setTimeout(addNextNode, DEMO_TIMING.DAG_NODE_INTERVAL_MS);
    } else {
      // Last node stays "running" for a bit then completes
      timerRef.current = setTimeout(() => {
        addNextNode(); // Will hit the >= edges.length branch
      }, DEMO_TIMING.DAG_NODE_INTERVAL_MS * 2);
    }
  }, [topology, onComplete]);

  useEffect(() => {
    if (enabled && topology.edges.length > 0 && !isExpanding && nodes.length === 0) {
      setIsExpanding(true);
      currentIndex.current = 0;
      addNextNode();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, topology, addNextNode, isExpanding, nodes.length]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNodes([]);
    setIsExpanding(false);
    currentIndex.current = 0;
  }, []);

  return { nodes, isExpanding, reset };
}
