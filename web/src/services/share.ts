export async function shareOrDownload(file: File, title: string, text?: string): Promise<"shared" | "downloaded"> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, files: [file], ...(text ? { text } : {}) });
    return "shared";
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return "downloaded";
}

export function fileFromBlob(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || "application/octet-stream" });
}
