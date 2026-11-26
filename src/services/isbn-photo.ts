import BinaryBitmap from "@zxing/library/esm/core/BinaryBitmap";
import DecodeHintType from "@zxing/library/esm/core/DecodeHintType";
import RGBLuminanceSource from "@zxing/library/esm/core/RGBLuminanceSource";
import HybridBinarizer from "@zxing/library/esm/core/common/HybridBinarizer";
import EAN13Reader from "@zxing/library/esm/core/oned/EAN13Reader";
import {validISBN} from "@/domain/book-query";

export function decodeBookBarcode(pixels: Uint8ClampedArray, width: number, height: number) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = (pixels[p] + 2 * pixels[p+1] + pixels[p+2]) / 4;
  }
  const source = new RGBLuminanceSource(gray, width, height);
  try {
    const code = new EAN13Reader().decode(new BinaryBitmap(new HybridBinarizer(source)),
      new Map([[DecodeHintType.TRY_HARDER, true]])).getText();
    return validISBN(code) ? code : null;
  } catch {
    return null;
  }
}

export async function readBookBarcode(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error("照片较大，请裁剪到书背条码再试。");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); }
    catch { throw new Error("这张照片无法打开，可以换一张照片或输入 ISBN。"); }
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {willReadFrequently:true});
    if (!ctx) throw new Error("这台设备无法读取照片，请输入书名或 ISBN。");
    for (const turn of [false, true]) {
      canvas.width = turn ? h : w;
      canvas.height = turn ? w : h;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (turn) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(img, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const isbn = decodeBookBarcode(frame.data, frame.width, frame.height);
      if (isbn) return isbn;
    }
    throw new Error("没有读到 ISBN 条码，请对准书背下方的整条条码重拍，或输入书名。");
  } finally {
    URL.revokeObjectURL(url);
  }
}
