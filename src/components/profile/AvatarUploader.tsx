import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  value?: string | null;
  onChange?: (publicUrl: string) => void;
  size?: number;
  className?: string;
};

const BUCKET_NAME = "avatars";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB cap

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
    e.target.value = "";
  };

  async function handleFile(file: File) {
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose an image file (jpg, png, webp, gif).");
        return;
      }

      setUploading(true);

      // If > 4MB, compress down; else keep as-is
      const needsCompress = file.size > 4 * 1024 * 1024;
      const processed = needsCompress
        ? await compressImage(file, 768, 768, 0.82)
        : file;

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        toast.error("Please sign in to change your profile photo.");
        return;
      }

      const ext =
        file.name.split(".").pop()?.toLowerCase() ||
        file.type.split("/")[1] ||
        "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, processed, {
          cacheControl: "3600",
          upsert: false,
          contentType: processed.type || "image/*",
        });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

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
          >
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <Input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

/** Compresses images if too large (keeps transparency if PNG). */
async function compressImage(
  file: File,
  maxW: number,
  maxH: number,
  quality = 0.85
): Promise<File> {
  const img = document.createElement("img");
  img.decoding = "async";
  img.src = URL.createObjectURL(file);
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
  });

  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  ctx.drawImage(img, 0, 0, width, height);

  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compression failed"))),
      mime,
      quality
    )
  );

  URL.revokeObjectURL(img.src);
  return new File([blob], file.name.replace(/\.\w+$/, mime.split("/")[1]), {
    type: mime,
  });
}
