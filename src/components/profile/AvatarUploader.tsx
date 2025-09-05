import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  /** Current avatar URL (e.g., from profile.avatar_url) */
  value?: string | null;
  /** Called with the new public URL after a successful upload */
  onChange?: (publicUrl: string) => void;
  /** Avatar size in px */
  size?: number;
  /** Optional className wrapper */
  className?: string;
};

const BUCKET_NAME = "avatars";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB cap

export default function AvatarUploader({
  value,
  onChange,
  size = 72,
  className,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const openPicker = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFile(file);
    // reset input so selecting the same file twice still triggers change
    e.target.value = "";
  };

  async function handleFile(file: File) {
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose an image file (JPG/PNG).");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error("Image is too large. Please keep it under 8MB.");
        return;
      }

      setUploading(true);

      // Slight compression for faster loads
      const compressed = await compressImage(file, 768, 768, 0.82);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        toast.error("Please sign in to change your profile photo.");
        return;
      }

      const ext = "jpg"; // we output JPEG from canvas below
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, compressed, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

      // Save on the profile row
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (profErr) throw profErr;

      setPreview(publicUrl);
      onChange?.(publicUrl);
      toast.success("Profile photo updated!");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`flex items-center gap-3 ${className || ""}`}>
      <Avatar
        className="ring-2 ring-primary/20"
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        <AvatarImage src={preview || value || undefined} />
        <AvatarFallback className="font-medium">U</AvatarFallback>
      </Avatar>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={openPicker} disabled={uploading}>
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </>
          )}
        </Button>

        {preview && !uploading && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPreview(null)}
            title="Clear local preview (does not delete the file)"
          >
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Hidden file input */}
      <Input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user" // opens camera on mobile if user chooses
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

/**
 * Compresses an image in the browser using canvas.
 * Outputs a JPEG Blob/File for consistent content-type.
 */
async function compressImage(
  file: File,
  maxW: number,
  maxH: number,
  quality = 0.85
): Promise<File> {
  // Load image
  const img = document.createElement("img");
  img.decoding = "async";
  img.src = URL.createObjectURL(file);
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = (e) => rej(e);
  });

  // Compute new size (keep aspect)
  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser.");

  // Draw & convert
  ctx.drawImage(img, 0, 0, width, height);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compression failed"))),
      "image/jpeg",
      quality
    )
  );

  URL.revokeObjectURL(img.src);
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}
