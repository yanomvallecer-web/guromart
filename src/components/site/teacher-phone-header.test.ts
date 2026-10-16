import { PassThrough } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { expect, test } from "vitest";
import { TeacherPhoneHeader } from "./teacher-phone-header";

test("phone branding and account navigation stream before delayed identity data", async () => {
  const pending = new Promise<never>(() => {});
  function DelayedIdentity(): never { throw pending; }

  const output = new PassThrough();
  const shell = new Promise<string>(resolve => output.once("data", chunk => resolve(chunk.toString())));
  const render = renderToPipeableStream(createElement(TeacherPhoneHeader, {
    greeting: createElement(DelayedIdentity),
    initial: createElement(DelayedIdentity),
  }), {
    onShellReady() { render.pipe(output); },
    onError() {}, // Aborting the deliberately suspended identity is expected below.
  });
  try {
    const html = await shell;
    expect(html).toContain('aria-label="GuroMart home"');
    expect(html).toContain('aria-label="Your account"');
    expect(html).toContain('href="/account"');
  } finally {
    render.abort();
    output.destroy();
  }
});
