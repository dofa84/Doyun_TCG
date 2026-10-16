// Decode and re-encode on the device; never upload the original photograph.
export async function compressCardImage(file: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error("PNG/JPEG/WebP 사진을 10 MiB 이하로 선택해주세요.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("사진을 읽을 수 없습니다. 정상적인 이미지 파일을 선택해주세요.");
  }
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("사진 해상도가 너무 큽니다. 4천만 화소 이하로 줄여주세요.");
    let scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이 브라우저에서 사진 압축을 지원하지 않습니다.");
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.8));
      if (blob && blob.size >= 12 && blob.size <= 512 * 1024)
        return new File([blob], "card-image." + (blob.type === "image/webp" ? "webp" : "png"), { type: blob.type });
      scale *= 0.7;
    }
    throw new Error("사진을 저장 한도까지 압축하지 못했습니다. 작은 사진을 선택해주세요.");
  } finally {
    bitmap.close();
  }
}
