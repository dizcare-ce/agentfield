import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface HitlReadonlyBannerProps {
  responder?: string;
  respondedAt?: string;
}

export function HitlReadonlyBanner({ responder, respondedAt }: HitlReadonlyBannerProps) {
  return (
    <Alert>
      <AlertTitle>Response already recorded</AlertTitle>
      <AlertDescription>
        {responder ? `${responder} already responded.` : "This request already has a recorded response."}
        {respondedAt ? ` Submitted ${new Date(respondedAt).toLocaleString()}.` : null}
      </AlertDescription>
    </Alert>
  );
}
