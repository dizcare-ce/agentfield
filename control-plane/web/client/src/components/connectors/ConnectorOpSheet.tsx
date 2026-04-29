import { useState, useMemo, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  JsonHighlightedPre,
} from "@/components/ui/json-syntax-highlight";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  invokeConnectorOperation,
  useConnectorInvocations,
} from "@/hooks/queries/useConnectors";
import type {
  ConnectorDetail,
  ConnectorOperation,
  ConnectorInvocationError,
} from "@/types/agentfield";

function HTTPMethodBadge({ method }: { method: string }) {
  const variants: Record<string, string> = {
    GET: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
    POST: "bg-green-500/20 text-green-700 dark:text-green-400",
    PUT: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
    PATCH: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
    DELETE: "bg-red-500/20 text-red-700 dark:text-red-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 text-xs font-semibold",
        variants[method] || variants.GET
      )}
    >
      {method}
    </span>
  );
}

interface ConnectorOpSheetProps {
  connector: ConnectorDetail;
  operation: ConnectorOperation;
  onClose: () => void;
}

interface ResultState {
  data: Record<string, unknown> | unknown[] | string | number | boolean | null;
  duration_ms: number;
  invocation_id: string;
}

interface InputSchema extends Record<string, unknown> {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
}

export function ConnectorOpSheet({
  connector,
  operation,
  onClose,
}: ConnectorOpSheetProps) {
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<ConnectorInvocationError | null>(null);
  
  const defaultValues = useMemo(() => {
    return Object.keys(operation.inputs).reduce(
      (acc, key) => ({
        ...acc,
        [key]: operation.inputs[key].default ?? "",
      }),
      {} as Record<string, unknown>
    );
  }, [operation.inputs]);

  const { control, handleSubmit } = useForm({
    defaultValues,
  });

  const { data: invocations } = useConnectorInvocations(20);

  const recentInvocations = useMemo(() => {
    if (!invocations?.invocations) return [];
    return invocations.invocations.filter(
      (inv) =>
        inv.connector_name === connector.name &&
        inv.operation_name === operation.name
    );
  }, [invocations, connector.name, operation.name]);

  const { mutate: invoke, isPending } = useMutation({
    mutationFn: async (formData: Record<string, unknown>) => {
      const inputs: Record<string, unknown> = {};
      
      Object.keys(operation.inputs).forEach((key) => {
        const schema = operation.inputs[key] as InputSchema;
        let value = formData[key];
        
        if ((schema.type === "array" || schema.type === "object") && typeof value === "string") {
          try {
            value = JSON.parse(value);
          } catch (e) {
            throw new Error(`Invalid JSON in field "${key}": ${(e as Error).message}`);
          }
        }
        
        inputs[key] = value;
      });

      const response = await invokeConnectorOperation(
        connector.name,
        operation.name,
        inputs
      );
      return response;
    },
    onSuccess: (data) => {
      setResult({
        data: data.result,
        duration_ms: data.duration_ms,
        invocation_id: data.invocation_id,
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(err as ConnectorInvocationError);
      setResult(null);
    },
  });

  const renderField = useCallback((fieldName: string) => {
    const schema = operation.inputs[fieldName] as InputSchema;
    const title = (schema.title as string) || fieldName;
    const description = schema.description ? String(schema.description) : "";
    
    if (schema.type === "boolean") {
      return (
        <div key={fieldName} className="flex items-center gap-2">
          <Controller
            name={fieldName}
            control={control}
            render={({ field }) => (
              <Checkbox
                id={fieldName}
                checked={field.value as boolean}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor={fieldName} className="text-sm font-medium text-foreground">
            {title}
          </Label>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      );
    }

    if (schema.enum) {
      return (
        <div key={fieldName} className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-foreground">
            {title}
          </Label>
          <Controller
            name={fieldName}
            control={control}
            render={({ field }) => (
              <Select value={String(field.value) || ""} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {(schema.enum as string[]).map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      );
    }

    if (schema.type === "array" || schema.type === "object") {
      return (
        <div key={fieldName} className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-foreground">
            {title}
          </Label>
          <Controller
            name={fieldName}
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                value={String(field.value) || ""}
                placeholder={`${schema.type === "array" ? "[" : "{"}`}
                className="font-mono text-xs"
                rows={4}
              />
            )}
          />
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      );
    }

    const inputType = schema.type === "number" || schema.type === "integer" ? "number" : "text";

    return (
      <div key={fieldName} className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-foreground">
          {title}
        </Label>
        <Controller
          name={fieldName}
          control={control}
          render={({ field }) => (
            <Input
              type={inputType}
              placeholder={description}
              {...field}
              value={String(field.value) || ""}
            />
          )}
        />
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    );
  }, [operation.inputs, control]);

  return (
    <Drawer open={true} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="flex flex-col gap-2 border-b">
          <div className="flex items-center gap-2">
            <HTTPMethodBadge method={operation.method} />
            <DrawerTitle className="text-lg">
              {operation.display || operation.name}
            </DrawerTitle>
          </div>
          <p className="text-sm text-muted-foreground">{connector.display}</p>
        </DrawerHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          <Tabs defaultValue="try" className="flex flex-1 flex-col">
            <TabsList className="mx-4 mt-4 grid w-auto grid-cols-3">
              <TabsTrigger value="try">Try it</TabsTrigger>
              <TabsTrigger value="schema">Schema</TabsTrigger>
              <TabsTrigger value="recent">Recent</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <TabsContent value="try" className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex flex-col gap-2">
                        <p>{error.error}</p>
                        {error.field_errors &&
                          Object.entries(error.field_errors).map(([field, msg]) => (
                            <p key={field} className="text-xs">
                              <code className="font-mono">{field}:</code> {msg}
                            </p>
                          ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {result && (
                  <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertDescription className="text-green-900 dark:text-green-100">
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-semibold">Success</p>
                        <p className="text-xs">
                          {result.duration_ms}ms · ID: {result.invocation_id}
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleSubmit((data) => invoke(data))} className="space-y-4">
                  {Object.keys(operation.inputs).map((fieldName) =>
                    renderField(fieldName)
                  )}

                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? "Invoking..." : "Invoke"}
                  </Button>
                </form>

                {result && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-foreground">
                      Response
                    </Label>
                    <div className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3">
                      <JsonHighlightedPre data={result.data} />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="schema" className="space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Inputs</h3>
                  <div className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3">
                    <JsonHighlightedPre data={operation.inputs} />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Output</h3>
                  <div className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3">
                    <JsonHighlightedPre data={operation.output} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="recent" className="space-y-4">
                {recentInvocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No recent invocations
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentInvocations.map((inv) => (
                      <div
                        key={inv.invocation_id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-1 flex-col gap-1">
                            <Badge
                              variant={
                                inv.status === "success" ? "default" : "destructive"
                              }
                              className="w-fit"
                            >
                              {inv.status}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {inv.duration_ms}ms · {new Date(inv.started_at).toLocaleString()}
                            </p>
                          </div>
                          {inv.http_status && (
                            <Badge variant="outline">{inv.http_status}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
