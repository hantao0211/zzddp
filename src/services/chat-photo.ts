import { CHAT_PHOTO_BYTES, type ChatPhoto } from "@/domain/assistant";

export async function prepareChatPhoto(file: File): Promise<ChatPhoto> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("这里可以发送照片或截图，PDF作业请从“交作业”上传。");
  if (file.size > 20 * 1024 * 1024) throw new Error("这张图片太大，请裁剪到想问的部分再发送。");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 48_000_000) throw new Error("这张图片尺寸太大，请裁剪后再试。");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("这台设备暂时无法处理图片，请换一个浏览器重试。");
    let scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    for (let pass = 0; pass < 5; pass++, scale *= .8) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.88, .76, .64]) {
        const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        if (base64 && base64.length <= Math.floor(CHAT_PHOTO_BYTES / 3) * 4) return { id: crypto.randomUUID(), mimeType: "image/jpeg", base64 };
      }
    }
    throw new Error("图片内容太多，请裁剪到想问的部分再试。");
  } catch (error) {
    if (error instanceof DOMException) throw new Error("这张照片无法读取，请换成JPG、PNG照片或截图再试。");
    throw error;
  } finally { URL.revokeObjectURL(url); image.src = ""; }
}
