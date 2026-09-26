import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { acquireDocumentScrollLock } from "../utils/documentScrollLock";

export default function NearbyDialog({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    element.showModal();
    const release = acquireDocumentScrollLock();
    return () => { element.close(); release(); };
  }, []);
  return (
    <dialog className="nearby-dialog" ref={ref} aria-labelledby="nearby-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="nearby-dialog-header"><h2 id="nearby-dialog-title">{title}</h2><button type="button" className="nearby-icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
      {children}
    </dialog>
  );
}
