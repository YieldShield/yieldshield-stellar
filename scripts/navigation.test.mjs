import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const listeners = new Map();
const breakpoint = { addEventListener: (key, fn) => listeners.set(`media:${key}`, fn), removeEventListener: (key) => listeners.delete(`media:${key}`) };
globalThis.window = { matchMedia: () => breakpoint };
globalThis.document = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key) => listeners.delete(key) };
const temp = mkdtempSync(resolve("node_modules/.navigation-test-"));
const output = await build({
  entryPoints: ["apps/web/src/Navigation.tsx"], bundle: true, format: "esm",
  platform: "node", packages: "external", write: false,
});
const modulePath = join(temp, "navigation.mjs");
writeFileSync(modulePath, output.outputFiles[0].text);
const { Navigation } = await import(pathToFileURL(modulePath).href);
after(() => {
  rmSync(temp, { recursive: true, force: true });
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const props = { path: "/protect", routeKey: "/protect?pool=pool-A", href: (path) => `${path}?pool=pool-A` };
const toggle = (r, label) => r.root.findAllByType("button").find((b) => b.props.children === label);
const controlled = (r, label) => r.root.findByProps({ id: toggle(r, label).props["aria-controls"] });
async function mount() {
  let r, focused;
  await act(async () => {
    r = create(React.createElement(Navigation, props), {
      createNodeMock: (element) => ({ contains: () => false, focus: () => { focused = element.props.children; } }),
    });
  });
  return { r, focus: () => focused };
}

test("navigation retains every destination and pool context behind correctly controlled disclosures", async () => {
  const { r } = await mount();
  const primary = r.root.findAllByProps({ className: "primary-links" })[0];
  assert.deepEqual(primary.findAllByType("a").map((a) => a.props.children), ["Markets", "Trade", "Protect", "Provide", "Portfolio"]);
  assert.equal(controlled(r, "More").props.hidden, true);
  assert.equal(controlled(r, "Menu").props.hidden, true);
  assert.deepEqual(controlled(r, "More").findAllByType("a").map((a) => a.props.children), ["Create pool", "Activity", "Funding", "Account", "Learn", "Status", "Legacy market"]);
  for (const a of r.root.findAllByType("a")) assert.match(a.props.href, /\?pool=pool-A$/);
  assert.equal(r.root.findAllByProps({ role: "menu" }).length, 0);
  await act(async () => toggle(r, "More").props.onClick());
  assert.equal(toggle(r, "More").props["aria-expanded"], true);
  assert.equal(controlled(r, "More").props.hidden, false);
  await act(async () => controlled(r, "More").findAllByType("a")[0].props.onClick());
  assert.equal(controlled(r, "More").props.hidden, true, "link activation closes even before route changes");
  await act(async () => r.unmount());
});

test("Escape restores the correct trigger, while outside focus and responsive changes close navigation", async () => {
  const { r, focus } = await mount();
  for (const label of ["More", "Menu"]) {
    await act(async () => toggle(r, label).props.onClick());
    let prevented = false;
    await act(async () => r.root.findByType("nav").props.onKeyDown({ key: "Escape", preventDefault: () => { prevented = true; } }));
    assert.equal(prevented, true);
    assert.equal(focus(), label);
    assert.equal(toggle(r, label).props["aria-expanded"], false);
  }
  await act(async () => toggle(r, "More").props.onClick());
  await act(async () => r.root.findByType("nav").props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: {} }));
  assert.equal(controlled(r, "More").props.hidden, true);
  await act(async () => toggle(r, "Menu").props.onClick());
  await act(async () => listeners.get("pointerdown")({ target: {} }));
  assert.equal(controlled(r, "Menu").props.hidden, true);
  await act(async () => toggle(r, "Menu").props.onClick());
  await act(async () => listeners.get("media:change")());
  assert.equal(controlled(r, "Menu").props.hidden, true);
  await act(async () => r.unmount());
  assert.equal(listeners.size, 0);
});

test("pool-only history changes close the disclosure and nested routes identify their primary destination", async () => {
  const { r } = await mount();
  await act(async () => toggle(r, "More").props.onClick());
  await act(async () => r.update(React.createElement(Navigation, { ...props, routeKey: "/protect?pool=pool-B" })));
  assert.equal(controlled(r, "More").props.hidden, true);
  for (const [path, label] of [["/positions/7", "Portfolio"], ["/markets/pool-A", "Markets"], ["/faucet", "Funding"], ["/learn/scenarios", "Learn"]]) {
    await act(async () => r.update(React.createElement(Navigation, { ...props, path, routeKey: path })));
    const current = r.root.findAllByProps({ "aria-current": "page" });
    assert.equal(current.length, 2, "desktop and mobile copies identify the same destination");
    assert.ok(current.every((a) => a.props.children === label));
  }
  await act(async () => r.unmount());
});
