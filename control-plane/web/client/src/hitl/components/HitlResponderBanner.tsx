import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useResponderIdentity } from "../hooks/useResponderIdentity";

export function HitlResponderBanner() {
  const { name, setName } = useResponderIdentity();
  const [draft, setDraft] = useState(name);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="truncate">Responding as: {name || "Unnamed responder"}</span>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Responder identity</DialogTitle>
          <DialogDescription>Choose the display name saved with your HITL responses.</DialogDescription>
        </DialogHeader>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Your name"
        />
        <DialogFooter>
          <Button
            onClick={() => {
              setName(draft.trim());
              setOpen(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
