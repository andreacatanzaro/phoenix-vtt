// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MemberView } from "@phoenix/shared";
import { PlayersPanel } from "./PlayersPanel";

afterEach(cleanup);

const members: MemberView[] = [
  { accountId: "dm", username: "Dora", role: "dm" },
  { accountId: "anna", username: "Anna", role: "player" },
  { accountId: "bruno", username: "Bruno", role: "player" },
];

describe("PlayersPanel", () => {
  it("lists everyone in the world, says who is at the table, and marks the DM and oneself", () => {
    render(<PlayersPanel members={members} present={[{ accountId: "dm", username: "Dora" }, { accountId: "anna", username: "Anna" }]} meId="anna" />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["Dora" + "DM" + "Al tavolo", "Anna (tu)" + "Al tavolo", "Bruno" + "Non connesso"]);
  });

  it("fades the ones who are not at the table", () => {
    render(<PlayersPanel members={members} present={[{ accountId: "dm", username: "Dora" }]} meId="dm" />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((r) => r.className)).toEqual(["here", "away", "away"]);
  });

  it("shows someone at the table even when the list of members has not arrived yet", () => {
    render(<PlayersPanel members={[]} present={[{ accountId: "anna", username: "Anna" }]} meId="x" />);
    expect(screen.getByText("Anna")).toBeTruthy();
  });

  it("gives each person a color, always the same", () => {
    render(<PlayersPanel members={members} present={[]} meId="dm" />);
    const dots = [...document.querySelectorAll(".people .dot")].map((d) => d.className);
    expect(dots).toHaveLength(3);
    cleanup();
    render(<PlayersPanel members={[...members].reverse()} present={[]} meId="dm" />);
    const again = [...document.querySelectorAll(".people .dot")].map((d) => d.className);
    expect(again.reverse()).toEqual(dots);
  });
});
