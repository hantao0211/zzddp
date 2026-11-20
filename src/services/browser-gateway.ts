import { StateSchema, type LearningGateway, type LearningState, type Material } from "@/domain/contracts";
import { attachMaterial, makeDemoState } from "@/domain/demo";

const KEY = "zzddp:prototype:v1";
const DATABASE = "zzddp-prototype-files";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DATABASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("浏览器无法保存文件，请检查存储空间或更换浏览器。"));
  });
}

export class BrowserDemoGateway implements LearningGateway {
  async load(): Promise<LearningState> {
    const text = localStorage.getItem(KEY);
    if (!text) return makeDemoState();
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { throw new Error("本地记录无法解析，已保留原始内容并暂停写入。"); }
    const parsed = StateSchema.safeParse(value);
    if (!parsed.success) throw new Error("本地记录格式异常，请先导出记录，不会自动覆盖已有数据。");
    return parsed.data;
  }

  async save(state: LearningState) {
    localStorage.setItem(KEY, JSON.stringify(StateSchema.parse(state)));
  }

  async addMaterial(material: Material, files: File[]) {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        files.forEach((file, index) => tx.objectStore("files").put(file, material.fileIds[index]));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("文件保存失败，请检查浏览器存储空间后重试。"));
        tx.onabort = () => reject(new Error("文件保存中断，请重试。"));
      });
      const state = await this.load();
      await this.save(attachMaterial(state, material));
    } finally { db.close(); }
  }

  async readFile(id: string): Promise<Blob | undefined> {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction("files").objectStore("files").get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error("无法读取文件，请重试。"));
      });
    } finally { db.close(); }
  }
}
