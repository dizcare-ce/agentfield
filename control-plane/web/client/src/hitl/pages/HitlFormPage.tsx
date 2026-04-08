import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { HitlApiError, submitHitlResponse } from "../api";
import { HitlExpiredBanner } from "../components/HitlExpiredBanner";
import { HitlFormRenderer } from "../components/HitlFormRenderer";
import { HitlMarkdown } from "../components/HitlMarkdown";
import { HitlReadonlyBanner } from "../components/HitlReadonlyBanner";
import { useHitlItem } from "../hooks/useHitlItem";
import { useResponderIdentity } from "../hooks/useResponderIdentity";

export function HitlFormPage() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const { data, isLoading, error } = useHitlItem(requestId);
  const { name, setName } = useResponderIdentity();
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [pendingValues, setPendingValues] = useState<Record<string, unknown> | null>(null);

  const mode = useMemo(() => {
    if (!data) return "edit" as const;
    return data.readonly ? "readonly" : "edit";
  }, [data]);

  const sendResponse = async (values: Record<string, unknown>, responder: string) => {
    if (!requestId) return;
    await submitHitlResponse(requestId, { responder, response: values });
    navigate(`/hitl/${requestId}/done`);
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    setTopError(null);
    setFieldErrors({});

    if (!name.trim()) {
      setPendingValues(values);
      setDraftName(name);
      setDialogOpen(true);
      return;
    }

    try {
      await sendResponse(values, name.trim());
    } catch (submitError) {
      if (submitError instanceof HitlApiError) {
        setTopError(submitError.message);
        setFieldErrors(submitError.fieldErrors);
        return;
      }
      setTopError(submitError instanceof Error ? submitError.message : "Unable to submit response.");
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading request...</div>;
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load request</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Request not found."}</AlertDescription>
      </Alert>
    );
  }

  const isExpired = data.readonly && data.status === "expired";
  const initialValues = data.response ?? {};

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link to="/hitl" className="inline-block text-sm text-muted-foreground hover:underline">
          ← Back to inbox
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{data.schema.title}</h1>
          {data.schema.description ? <HitlMarkdown content={data.schema.description} /> : null}
        </div>
      </div>

      {topError ? (
        <Alert variant="destructive">
          <AlertTitle>Submission failed</AlertTitle>
          <AlertDescription>{topError}</AlertDescription>
        </Alert>
      ) : null}

      {isExpired ? <HitlExpiredBanner expiresAt={data.expires_at} /> : null}
      {!isExpired && data.readonly ? (
        <HitlReadonlyBanner responder={data.responder} respondedAt={data.responded_at} />
      ) : null}

      <Separator />

      <HitlFormRenderer
        schema={data.schema}
        initialValues={initialValues}
        mode={mode}
        onSubmit={handleSubmit}
        externalErrors={fieldErrors}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Who are you responding as?</DialogTitle>
            <DialogDescription>
              Your display name is saved alongside the form response.
            </DialogDescription>
          </DialogHeader>
          <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Your name" />
          <DialogFooter>
            <Button
              onClick={async () => {
                const trimmed = draftName.trim();
                if (!trimmed || !pendingValues) return;
                setName(trimmed);
                setDialogOpen(false);
                try {
                  await sendResponse(pendingValues, trimmed);
                } catch (submitError) {
                  if (submitError instanceof HitlApiError) {
                    setTopError(submitError.message);
                    setFieldErrors(submitError.fieldErrors);
                    return;
                  }
                  setTopError(
                    submitError instanceof Error ? submitError.message : "Unable to submit response.",
                  );
                }
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
