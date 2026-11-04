import { useState } from "react";
import { t, type MessageView, type TableCommand } from "@phoenix/shared";
import type { Me } from "./table/state";

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const;

type Props = {
  messages: readonly MessageView[];
  me: Me;
  /** Everyone in the world, to whisper to. */
  people: readonly { accountId: string; username: string }[];
  send: (command: TableCommand) => boolean;
};

function Line({ message, me }: { message: MessageView; me: Me }) {
  if (message.kind === "system") return <li className="line system">{message.text}</li>;
  const tag =
    message.audience === "whisper"
      ? message.authorId === me.accountId
        ? t("ui.world.table.chat.whisper-to", { name: message.recipientName ?? "" })
        : t("ui.world.table.chat.whisper-from", { name: message.authorName })
      : message.audience === "gm"
        ? t("ui.world.table.chat.reserved")
        : null;
  return (
    <li className={`line ${message.kind}${message.audience === "all" ? "" : " private"}`}>
      <span className="who-line">
        <span className="author">{message.authorName}</span>
        {tag !== null && <span className="badge">{tag}</span>}
      </span>
      {message.kind === "roll" && message.roll !== null ? (
        <span className="roll">
          <span className="muted small">{t("ui.world.table.chat.rolls", { name: message.authorName, notation: message.notation ?? "" })}</span>
          <span className="dice">[{message.roll.dice.join(", ")}]</span>
          <strong className="total" aria-label={String(message.roll.total)}>{message.roll.total}</strong>
        </span>
      ) : (
        <span className="text">{message.text}</span>
      )}
    </li>
  );
}

/** The log of the table, the box to write in, and the dice. */
export function ChatPanel({ messages, me, people, send }: Props) {
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [notation, setNotation] = useState("");
  const [reserved, setReserved] = useState(false);
  const others = people.filter((p) => p.accountId !== me.accountId);

  const submit = (e: { preventDefault: () => void }): void => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "") return;
    if (send({ type: "chat.send", text: trimmed, whisperTo: to === "" ? null : to })) setText("");
  };

  const roll = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed === "") return;
    send({ type: "roll.request", notation: trimmed, reserved });
  };

  return (
    <section className="panel chat" aria-label={t("ui.world.table.chat.title")}>
      <h2 className="section-title">{t("ui.world.table.chat.title")}</h2>
      <ol className="log" role="log" aria-live="polite" aria-label={t("ui.world.table.chat.log")}>
        {messages.length === 0 && <li className="muted small">{t("ui.world.table.chat.empty")}</li>}
        {messages.map((m) => (
          <Line key={m.id} message={m} me={me} />
        ))}
      </ol>
      <form onSubmit={submit} className="compose">
        <label className="field">
          {t("ui.world.table.chat.to")}
          <select value={to} onChange={(e) => { setTo(e.target.value); }}>
            <option value="">{t("ui.world.table.chat.everyone")}</option>
            {others.map((p) => (
              <option key={p.accountId} value={p.accountId}>{t("ui.world.table.chat.whisper-to", { name: p.username })}</option>
            ))}
          </select>
        </label>
        <div className="row nowrap">
          <input value={text} maxLength={2000} placeholder={t("ui.world.table.chat.placeholder")} aria-label={t("ui.world.table.chat.message")} onChange={(e) => { setText(e.target.value); }} />
          <button type="submit" className="btn">{t("ui.world.table.chat.send")}</button>
        </div>
      </form>
      <div className="dice-bar">
        <h3 className="section-title">{t("ui.world.table.chat.dice")}</h3>
        <div className="row">
          {DICE.map((d) => (
            <button key={d} type="button" className="btn quiet small" onClick={() => { roll(`1${d}`); }}>{d}</button>
          ))}
        </div>
        <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); roll(notation); }}>
          <input value={notation} maxLength={60} placeholder="2d6+3" aria-label={t("ui.world.table.chat.notation")} onChange={(e) => { setNotation(e.target.value); }} />
          <button type="submit" className="btn quiet">{t("ui.world.table.chat.roll")}</button>
        </form>
        <p className="muted small">{t("ui.world.table.chat.notation-hint")}</p>
        <label className="switch">
          <input type="checkbox" checked={reserved} onChange={(e) => { setReserved(e.target.checked); }} />
          {t("ui.world.table.chat.roll-reserved")}
        </label>
      </div>
    </section>
  );
}
