import React, { useLayoutEffect, useRef } from "react";

type ModalProps = {
  titleId: string;
  onCancel: () => void;
  closeDisabled?: boolean;
  width?: number;
  children: React.ReactNode;
};

// Chromium handles background inertness, Tab containment and focus restoration.
export function Modal({ titleId, onCancel, closeDisabled = false, width = 400, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={ref} className="panel modal" aria-labelledby={titleId} aria-modal="true"
      style={{ width }} onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onCancel();
      }}>
      {children}
    </dialog>
  );
}
