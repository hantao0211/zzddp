import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import type { UploadView } from "@/domain/homework";

const uploadTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false,
});

export function HomeworkUploadList({ title, uploads, filtered, open, status, children }: {
  title: string; uploads: UploadView[]; filtered: boolean; open: (id: string) => void;
  status: (upload: UploadView) => ReactNode; children?: ReactNode;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 5;
  const pages = Math.ceil(uploads.length / pageSize);
  const current = Math.min(page, Math.max(0, pages - 1));
  return <section className="card hw-archive">
    <div className="section-heading"><h2><FolderOpen size={20} aria-hidden="true"/>{title}</h2><small className="hw-task-count">{uploads.length} 份</small></div>
    {children}
    {uploads.slice(current * pageSize, (current + 1) * pageSize).map(upload => {
      const subject = upload.subjects.join("、");
      const name = upload.kind === "memo" ? "作业备忘录" : upload.target?.title || (subject ? subject + "作业" : "作业照片");
      const time = Date.parse(upload.createdAt);
      const metadata = [upload.target?.subject || (upload.kind === "memo" ? subject : ""), upload.files.length + " 个原件", Number.isFinite(time) ? uploadTime.format(time) : ""];
      return <button key={upload.id} type="button" className="hw-file-row hw-record-row" aria-haspopup="dialog" onClick={() => open(upload.id)}>
        <span className="hw-record-main"><strong>{name}</strong><small>{metadata.filter(Boolean).join(" · ")}</small></span>
        {status(upload)}<ChevronRight className="hw-record-arrow" size={15} aria-hidden="true"/>
      </button>;
    })}
    {!uploads.length && <p className="hw-no-files">{filtered ? "这个科目当天没有资料。" : "这一天还没有收到资料。"}</p>}
    {pages > 1 && <nav className="hw-record-pages" aria-label="资料分页">
      <button className="text-button" disabled={!current} onClick={()=>setPage(current-1)} aria-label="上一页资料"><ChevronLeft size={15}/>上一页</button>
      <span aria-live="polite">{current+1} / {pages}</span>
      <button className="text-button" disabled={current+1===pages} onClick={()=>setPage(current+1)} aria-label="下一页资料">下一页<ChevronRight size={15}/></button>
    </nav>}
  </section>;
}
