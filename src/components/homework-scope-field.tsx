"use client";
import { useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { HomeworkScopeSchema, type HomeworkScope, type HomeworkScopeSource } from "@/domain/homework-scope";
import { scopeLabels } from "@/domain/practice";
import { homeworkRequest } from "@/services/homework-gateway";

export function HomeworkScopeSelect({ value, change, disabled }: {
  value: HomeworkScope | ""; change: (value: HomeworkScope | "") => void; disabled?: boolean;
}) {
  return <label className="hw-scope-field">作业归属
    <select value={value} onChange={event => change(event.target.value ? HomeworkScopeSchema.parse(event.target.value) : "")} disabled={disabled}>
      <option value="" disabled>请选择课内或课外</option>
      {HomeworkScopeSchema.options.map(scope => <option key={scope} value={scope}>{scopeLabels[scope]}</option>)}
    </select>
  </label>;
}

export function HomeworkScopeForm({ source, saved }: {
  source: HomeworkScopeSource; saved: (source: HomeworkScopeSource) => void;
}) {
  const [selection, setSelection] = useState<HomeworkScope | "">(source.scope === "unknown" ? "" : source.scope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);

  async function save() {
    if (saving.current || !selection) return;
    const { kind, id, date } = source;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await homeworkRequest<HomeworkScopeSource>("/source-scope", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { kind, id, date }, scope: selection }),
      });
      saved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作业归属暂未保存。");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <form className="hw-scope-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <HomeworkScopeSelect value={selection} change={setSelection} disabled={busy} />
    <p className="hw-secondary">这份作业收录的错题会沿用该归属。单独纠正过的题保留自己的归属。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="button primary" disabled={busy || !selection || source.confirmed && selection === source.scope}>
      {busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
      {busy ? "正在保存…" : "保存作业归属"}
    </button>
  </form>;
}
