import { useQuery } from "@tanstack/react-query";
import { getHitlItem } from "../api";

export function useHitlItem(requestId: string | undefined) {
  return useQuery({
    queryKey: ["hitl", "item", requestId],
    queryFn: () => {
      if (!requestId) {
        throw new Error("Missing request id");
      }
      return getHitlItem(requestId);
    },
    enabled: Boolean(requestId),
    staleTime: 15_000,
  });
}
