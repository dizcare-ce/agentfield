import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface HitlExpiredBannerProps {
  expiresAt?: string;
}

export function HitlExpiredBanner({ expiresAt }: HitlExpiredBannerProps) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Request expired</AlertTitle>
      <AlertDescription>
        This HITL request is no longer accepting responses.
        {expiresAt ? ` It expired ${new Date(expiresAt).toLocaleString()}.` : null}
      </AlertDescription>
    </Alert>
  );
}
