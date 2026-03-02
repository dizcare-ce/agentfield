import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Trash,
  Plus,
  ArrowRight,
} from "@/components/ui/icon-bridge";
import { CompactTable } from "@/components/ui/CompactTable";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FastTableSearch } from "@/components/ui/FastTableSearch";
import { SegmentedStatusFilter } from "@/components/ui/segmented-status-filter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useSuccessNotification,
  useErrorNotification,
} from "@/components/ui/notification";
import { statusTone } from "../../lib/theme";
import { cn } from "../../lib/utils";
import * as policiesApi from "../../services/accessPoliciesApi";
import type { AccessPolicy, AccessPolicyRequest } from "../../services/accessPoliciesApi";
import { TooltipTagList } from "@/components/ui/tooltip-tag-list";
import { PolicyFormDialog } from "./PolicyFormDialog";

const GRID_TEMPLATE =
  "minmax(160px,2fr) minmax(160px,2fr) 72px 80px 80px";

const MAX_VISIBLE_TAGS = 2;

function renderRuleCell(callerTags: string[], targetTags: string[]) {
  const hasOverflow =
    callerTags.length > MAX_VISIBLE_TAGS ||
    targetTags.length > MAX_VISIBLE_TAGS ||
    callerTags.some((t) => t.length > 15) ||
    targetTags.some((t) => t.length > 15);

  const renderSide = (tags: string[]) => {
    if (!tags.length)
      return (
        <Badge
          variant="secondary"
          size="sm"
          showIcon={false}
          className="italic opacity-60 flex-shrink-0"
        >
          *
        </Badge>
      );
    const visible = tags.slice(0, MAX_VISIBLE_TAGS);
    const overflow = tags.length - MAX_VISIBLE_TAGS;
    return (
      <>
        {visible.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            size="sm"
            showIcon={false}
            className="truncate max-w-[96px] flex-shrink"
          >
            {tag}
          </Badge>
        ))}
        {overflow > 0 && (
          <Badge variant="count" size="sm" className="flex-shrink-0">
            +{overflow}
          </Badge>
        )}
      </>
    );
  };

  const content = (
    <div className="flex items-center gap-1 min-w-0 overflow-hidden">
      {renderSide(callerTags)}
      <ArrowRight className="h-3.5 w-3.5 mx-1 text-muted-foreground flex-shrink-0" weight="bold" />
      {renderSide(targetTags)}
    </div>
  );

  if (hasOverflow) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default min-w-0 overflow-hidden">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          <TooltipTagList
            groups={[
              { label: "From", tags: callerTags },
              { label: "To", tags: targetTags },
            ]}
          />
        </TooltipContent>
      </Tooltip>
    );
  }
  return content;
}

interface AccessRulesTabProps {
  policies: AccessPolicy[];
  loading: boolean;
  onRefresh: () => void;
}

export function AccessRulesTab({ policies, loading, onRefresh }: AccessRulesTabProps) {
  const showSuccess = useSuccessNotification();
  const showError = useErrorNotification();

  // Sort state
  const [sortBy, setSortBy] = useState("priority");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  // Create/edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<AccessPolicy | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditPolicy(null);
    setFormOpen(true);
  };

  const openEdit = (p: AccessPolicy) => {
    setEditPolicy(p);
    setFormOpen(true);
  };

  const handleSave = async (req: AccessPolicyRequest, editId?: number) => {
    try {
      if (editId) {
        await policiesApi.updatePolicy(editId, req);
        showSuccess(`Policy "${req.name}" updated`);
      } else {
        await policiesApi.createPolicy(req);
        showSuccess(`Policy "${req.name}" created`);
      }
      onRefresh();
    } catch (err: unknown) {
      showError("Failed to save policy", err instanceof Error ? err.message : undefined);
      throw err; // re-throw so PolicyFormDialog knows it failed
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      setDeleting(true);
      await policiesApi.deletePolicy(deleteId);
      showSuccess("Policy deleted");
      setDeleteId(null);
      onRefresh();
    } catch (err: unknown) {
      showError("Failed to delete policy", err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Filtered + sorted data
  const filteredPolicies = useMemo(() => {
    let result = policies;

    // Action filter
    if (actionFilter !== "all") {
      result = result.filter((p) => p.action === actionFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          p.caller_tags.some((t) => t.toLowerCase().includes(q)) ||
          p.target_tags.some((t) => t.toLowerCase().includes(q)) ||
          (p.allow_functions || []).some((f) => f.toLowerCase().includes(q)) ||
          (p.deny_functions || []).some((f) => f.toLowerCase().includes(q))
      );
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "priority":
          cmp = a.priority - b.priority;
          break;
        default:
          cmp = 0;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [policies, actionFilter, searchQuery, sortBy, sortOrder]);

  // Filter option counts
  const actionOptions = useMemo(
    () => [
      { value: "all", label: "All", count: policies.length },
      {
        value: "allow",
        label: "Allow",
        count: policies.filter((p) => p.action === "allow").length,
      },
      {
        value: "deny",
        label: "Deny",
        count: policies.filter((p) => p.action === "deny").length,
      },
    ],
    [policies]
  );

  const columns = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      align: "left" as const,
      render: (item: AccessPolicy) => {
        const needsTooltip =
          item.name.length > 25 ||
          (item.description ?? "").length > 40;
        const cell = (
          <div className="min-w-0 overflow-hidden">
            <div className="font-medium text-sm truncate leading-snug">
              {item.name}
            </div>
            {item.description && (
              <div className="text-xs text-muted-foreground truncate leading-snug mt-0.5">
                {item.description}
              </div>
            )}
          </div>
        );
        if (needsTooltip) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default min-w-0 overflow-hidden">{cell}</div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="font-medium text-xs">{item.name}</div>
                {item.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.description}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        }
        return cell;
      },
    },
    {
      key: "rule",
      header: "Rule",
      sortable: false,
      align: "left" as const,
      render: (item: AccessPolicy) =>
        renderRuleCell(item.caller_tags, item.target_tags),
    },
    {
      key: "action",
      header: "Action",
      sortable: false,
      align: "center" as const,
      render: (item: AccessPolicy) => (
        <Badge
          variant="outline"
          size="sm"
          showIcon={false}
          className={cn(
            "uppercase tracking-wide",
            item.action === "allow"
              ? statusTone.success.border
              : statusTone.error.border
          )}
        >
          {item.action}
        </Badge>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      align: "center" as const,
      render: (item: AccessPolicy) => (
        <Badge variant="metadata" size="sm">{item.priority}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      sortable: false,
      align: "right" as const,
      render: (item: AccessPolicy) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              openEdit(item);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-status-error hover:bg-status-error-bg"
            title="Delete policy"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setDeleteId(item.id);
            }}
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <FastTableSearch
            onSearch={setSearchQuery}
            placeholder="Search policies..."
            resultCount={filteredPolicies.length}
            totalCount={policies.length}
          />
        </div>
        <SegmentedStatusFilter
          value={actionFilter}
          onChange={setActionFilter}
          options={actionOptions}
        />
        <div className="ml-auto">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Policy
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0">
        <TooltipProvider>
          <CompactTable
            data={filteredPolicies}
            columns={columns}
            loading={loading}
            hasMore={false}
            isFetchingMore={false}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            gridTemplate={GRID_TEMPLATE}
            rowHeight={48}
            getRowKey={(item) => String(item.id)}
            emptyState={{
              title: "No access policies",
              description:
                "Create a policy to enable tag-based authorization for cross-agent calls.",
            }}
          />
        </TooltipProvider>
      </div>

      {/* Create/Edit Dialog */}
      <PolicyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editPolicy={editPolicy}
        onSave={handleSave}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Policy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this access policy? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
