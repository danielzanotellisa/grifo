/**
 * An `XMLHttpRequest` for the component tests: the upload `PUT` goes through the global `fetch` (the
 * fake API), and the progress is reported at half and at the end, so a screen can be tested while a
 * transfer is held and after it ends.
 */
export class FakeXMLHttpRequest {
  status = 0;
  upload: {
    onprogress:
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private method = "GET";
  private url = "";
  private headers: Record<string, string> = {};
  private aborted = false;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  send(body: Blob) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: body.size / 2, total: body.size });
    fetch(this.url, { method: this.method, headers: this.headers, body }).then(
      (response) => {
        if (this.aborted) return;
        this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
        this.status = response.status;
        this.onload?.();
      },
      () => {
        if (!this.aborted) this.onerror?.();
      },
    );
  }
}
