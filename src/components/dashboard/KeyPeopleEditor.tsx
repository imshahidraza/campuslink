"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { removeKeyPersonAction } from "@/lib/actions/recruiter";
import { MAX_KEY_PEOPLE, MAX_PHOTO_BYTES, type KeyPersonView } from "@/lib/keyPeopleShared";

const inputCls =
  "w-full rounded-xl border border-border-soft bg-surface px-3.5 py-2 text-sm text-ink focus:outline-none focus:border-brand-300";

function Slot({ position, person }: { position: number; person: KeyPersonView | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [role, setRole] = useState(person?.role ?? "");
  const [name, setName] = useState(person?.name ?? "");
  const [link, setLink] = useState(person?.profileUrl ?? "");

  const savedPhoto = person?.hasPhoto && !removePhoto ? `/api/key-people/${person.id}/photo?v=${person.photoVersion}` : null;
  const shownPhoto = preview ?? savedPhoto;

  function choose(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (f.size > MAX_PHOTO_BYTES) {
      toast("That photo is too large. The limit is 2 MB.", "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRemovePhoto(false);
  }

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("position", String(position));
      fd.set("role", role);
      fd.set("name", name);
      fd.set("profileUrl", link);
      if (file) fd.set("photo", file);
      if (removePhoto && !file) fd.set("removePhoto", "1");
      try {
        const res = await fetch("/api/key-people", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data.error || "Couldn't save. Please try again.", "error");
          return;
        }
        toast("Saved.");
        if (preview) URL.revokeObjectURL(preview);
        setFile(null);
        setPreview(null);
        setRemovePhoto(false);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch {
        toast("Couldn't save. Please check your connection and try again.", "error");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await removeKeyPersonAction(position);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      toast("Removed.", "info");
      setRole("");
      setName("");
      setLink("");
      choose(null);
      setRemovePhoto(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-col items-center text-center">
          {shownPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownPhoto} alt="" className="h-24 w-24 rounded-full object-cover border border-border-soft bg-surface" />
          ) : (
            <span className="h-24 w-24 rounded-full bg-surface-2 text-muted flex items-center justify-center" aria-hidden>
              <User className="h-10 w-10" />
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id={`kp-photo-${position}`}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
          />
          <div className="mt-3 flex items-center gap-2">
            <label
              htmlFor={`kp-photo-${position}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 hover:bg-border-soft px-3 py-1.5 text-xs font-medium text-ink cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" /> {shownPhoto ? "Change photo" : "Upload photo"}
            </label>
            {shownPhoto && (
              <button
                type="button"
                onClick={() => {
                  choose(null);
                  setRemovePhoto(true);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-xs text-muted hover:text-rose-600"
              >
                Remove photo
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted mt-1.5">JPG, PNG or WebP, up to 2 MB</p>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={`kp-role-${position}`} className="text-xs text-muted mb-1 block">Role</label>
            <input
              id={`kp-role-${position}`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={60}
              placeholder="e.g. CEO, HR, CFO"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor={`kp-name-${position}`} className="text-xs text-muted mb-1 block">Name</label>
            <input id={`kp-name-${position}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} />
          </div>
          <div>
            <label htmlFor={`kp-link-${position}`} className="text-xs text-muted mb-1 block">LinkedIn or profile link</label>
            <input
              id={`kp-link-${position}`}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={300}
              inputMode="url"
              placeholder="https://www.linkedin.com/in/..."
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button size="sm" onClick={save} disabled={isPending || !role.trim() || !name.trim()}>
            {isPending ? "Saving..." : person ? "Save changes" : "Add person"}
          </Button>
          {person && (
            <Button size="sm" variant="ghost" onClick={remove} disabled={isPending} aria-label={`Remove ${person.name}`}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function KeyPeopleEditor({ people }: { people: KeyPersonView[] }) {
  const byPosition = new Map(people.map((p) => [p.position, p]));
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {Array.from({ length: MAX_KEY_PEOPLE }, (_, i) => {
        const p = byPosition.get(i) ?? null;
        // A new key means the slot starts fresh with the saved values after a save.
        return <Slot key={`${i}-${p?.id ?? "new"}-${p?.photoVersion ?? 0}-${p?.role ?? ""}-${p?.name ?? ""}`} position={i} person={p} />;
      })}
    </div>
  );
}
