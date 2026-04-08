import { CheckCircle2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useResponderIdentity } from "../hooks/useResponderIdentity";

export function HitlDonePage() {
  const { requestId } = useParams();
  const { name } = useResponderIdentity();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg text-center">
        <CardHeader className="items-center">
          <CheckCircle2 className="size-10 text-primary" />
          <CardTitle>Response recorded</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{name ? `Saved as ${name}.` : "Your response was recorded."}</p>
          <Link to="/hitl" className="inline-block hover:underline">
            Back to inbox
          </Link>
          {requestId ? <p className="font-mono text-xs">{requestId}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
