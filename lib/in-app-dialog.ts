export type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

type Request =
  | { kind: "confirm"; message: string; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; message: string; initialValue: string; options: ConfirmOptions; resolve: (value: string | null) => void };
type RequestInput =
  | { kind: "confirm"; message: string; options: ConfirmOptions }
  | { kind: "prompt"; message: string; initialValue: string; options: ConfirmOptions };

const requestEvent = "heika:in-app-dialog";

function request<T>(detail: RequestInput, fallback: T): Promise<T> {
  if (typeof window === "undefined") return Promise.resolve(fallback);
  return new Promise<T>((resolve) => {
    const event = new CustomEvent<Request>(requestEvent, { detail: { ...detail, resolve } as Request });
    window.dispatchEvent(event);
  });
}

export function confirmInApp(message: string, options: ConfirmOptions = {}) {
  return request<boolean>({ kind: "confirm", message, options }, false);
}

export function promptInApp(message: string, initialValue = "", options: ConfirmOptions = {}) {
  return request<string | null>({ kind: "prompt", message, initialValue, options }, null);
}

export const IN_APP_DIALOG_EVENT = requestEvent;
