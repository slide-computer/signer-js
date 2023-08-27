import { Linking } from "../types";

export class WebLinking implements Linking {
  open(url: string): void {
    const width = 380;
    const height = 540;
    const left = window.outerWidth / 2 + window.screenX - width / 2;
    const top = window.outerHeight / 2 + window.screenY - height / 2;
    window.open(
      url,
      "slideWallet",
      Object.entries({
        top,
        left,
        width,
        height,
        status: 0,
        toolbar: 0,
        menubar: 0,
        resizable: 0,
        opener: 1,
      })
        .map((entry) => entry.join("="))
        .join(","),
    );
  }
}
