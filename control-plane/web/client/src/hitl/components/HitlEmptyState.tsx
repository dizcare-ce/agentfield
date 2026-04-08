import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function HitlEmptyState() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>All caught up</CardTitle>
          <CardDescription>All caught up — no tasks waiting for input.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          New HITL requests will appear here as soon as an execution pauses for human input.
        </CardContent>
      </Card>
    </div>
  );
}
