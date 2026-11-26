"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";

export function PhotoPreviewButton({ src, alt, label, children, className = "text-button" }: {
  src: string;
  alt: string;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" ref={trigger} className={className} aria-label={label} aria-haspopup="dialog"
      onClick={() => setOpen(true)}>{children}</button>
    {open && createPortal(<PhotoPreview src={src} alt={alt} close={() => {
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    }} />, document.body)}
  </>;
}

function PhotoPreview({ src, alt, close }: { src: string; alt: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => element?.close();
  }, []);

  function dismiss() {
    dialog.current?.close();
    close();
  }

  return <dialog className="photo-viewer" ref={dialog} aria-label="照片预览" onCancel={event => {
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  }}>
    <header>
      <h2>照片预览</h2>
      <button ref={closeButton} type="button" className="photo-viewer-close" onClick={dismiss}>
        <X size={20} aria-hidden="true" />关闭照片
      </button>
    </header>
    <PhotoPreviewContent src={src} alt={alt}/>
  </dialog>;
}

export function PhotoPreviewContent({src,alt}:{src:string;alt:string}) {
  const stage = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  function toggleZoom() {
    setZoomed(value => !value);
    stage.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  return <>
    <div ref={stage} className="photo-viewer-stage" data-zoom={zoomed}>
      {status === "loading" && <p role="status">正在加载照片…</p>}
      {status === "error" && <div className="photo-viewer-error">
        <p role="alert">照片暂时无法打开。</p>
        <button type="button" className="button primary" onClick={() => {
          setStatus("loading");
          setAttempt(value => value + 1);
        }}>重试</button>
      </div>}
      <img key={attempt} src={src} alt={alt} decoding="async" hidden={status !== "ready"}
        onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
    </div>
    {status === "ready" && <footer>
      <button type="button" className="photo-viewer-zoom" aria-pressed={zoomed} onClick={toggleZoom}>
        {zoomed ? <ZoomOut size={18} aria-hidden="true" /> : <ZoomIn size={18} aria-hidden="true" />}
        {zoomed ? "缩回整页" : "放大看细节"}
      </button>
    </footer>}
  </>;
}
