import { fireEvent, screen, within } from "@testing-library/react";
import { vi } from "vitest";

export type Route = { status: number; body?: unknown };

/**
 * A fake server for component tests: each call takes the next answer registered for "METHOD /path". A route with
 * `repeat` keeps answering with its last answer. Returns the list of calls made, with their JSON bodies.
 */
export function fakeServer(routes: Record<string, Route[]>): { calls: string[]; bodies: Record<string, unknown[]> } {
  const calls: string[] = [];
  const bodies: Record<string, unknown[]> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      calls.push(key);
      if (typeof init?.body === "string") (bodies[key] ??= []).push(JSON.parse(init.body));
      const queue = routes[key];
      const route = queue !== undefined && queue.length > 1 ? queue.shift() : queue?.[0];
      if (route === undefined) return Promise.resolve(new Response(JSON.stringify({ error: "errors.not-found" }), { status: 404 }));
      return Promise.resolve(new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status }));
    }),
  );
  return { calls, bodies };
}

/** The input found by its label, or a failure that says which one is missing. */
export function inputLabelled(label: string | RegExp): HTMLInputElement {
  const found = screen.getByLabelText(label);
  if (!(found instanceof HTMLInputElement)) throw new Error(`"${String(label)}" is not an input`);
  return found;
}

export function buttonNamed(name: string): HTMLButtonElement {
  const found = screen.getByRole("button", { name });
  if (!(found instanceof HTMLButtonElement)) throw new Error(`"${name}" is not a button`);
  return found;
}

/**
 * Shows an element of the structure by its name: "Trova" lists every element with the path above it, and choosing one goes
 * into the groups above it and picks it, so its details are on screen.
 */
export async function pickElement(name: string): Promise<void> {
  const select = await screen.findByLabelText("Trova");
  const option = await within(select).findByText((_, element) => element instanceof HTMLOptionElement && element.textContent.split(" › ").at(-1) === name);
  if (!(option instanceof HTMLOptionElement)) throw new Error(`"${name}" is not an option`);
  fireEvent.change(select, { target: { value: option.value } });
}

/** The node of the graph with this name, if it is on the screen. */
export function graphNode(name: string): HTMLElement | null {
  return within(screen.getByTestId("graph-sky")).queryByRole("button", { name });
}
