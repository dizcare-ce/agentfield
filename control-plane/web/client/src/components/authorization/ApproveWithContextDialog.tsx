import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "@/components/ui/icon-bridge";
import { PolicyContextPanel } from "./PolicyContextPanel";
import type { AccessPolicy } from "../../services/accessPoliciesApi";
import type { AgentTagSummary } from "../../services/tagApprovalApi";

interface ApproveWithContextDialogProps {
  agent: AgentTagSummary | null;
  policies: AccessPolicy[];
  onApprove: (agentId: string, selectedTags: string[]) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function ApproveWithContextDialog({
  agent,
  policies,
  onApprove,
  onOpenChange,
}: ApproveWithContextDialogProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (agent) {
      setSelectedTags([...(agent.proposed_tags || [])]);
    }
  }, [agent]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleApprove = async () => {
    if (!agent || selectedTags.length === 0) return;
    try {
      setLoading(true);
      await onApprove(agent.agent_id, selectedTags);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!agent} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve Tags</DialogTitle>
          <DialogDescription>
            Approve tags for agent{" "}
            <span className="font-mono font-medium">{agent?.agent_id}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Select tags to approve</Label>
            <div className="flex flex-wrap gap-2">
              {(agent?.proposed_tags || []).map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="cursor-pointer"
                  >
                    <Badge
                      variant={isSelected ? "outline" : "secondary"}
                      size="sm"
                      showIcon={false}
                      className={
                        isSelected
                          ? "border-status-success-border text-status-success-light"
                          : "opacity-50"
                      }
                    >
                      {isSelected && (
                        <CheckCircle className="w-3 h-3 mr-0.5" />
                      )}
                      {tag}
                    </Badge>
                  </button>
                );
              })}
            </div>
            {selectedTags.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Select at least one tag to approve.
              </p>
            )}
          </div>

          <div className="border-t pt-3">
            <Label className="mb-2 block">
              Policy Impact
            </Label>
            <PolicyContextPanel tags={selectedTags} policies={policies} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={loading || selectedTags.length === 0}
          >
            {loading ? "Approving..." : `Approve ${selectedTags.length} tag(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
