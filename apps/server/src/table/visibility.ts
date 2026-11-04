import type { MessageView, TokenView, WorldRole } from "@phoenix/shared";

/** Who is looking: the one place every decision about "who may see this" is made. */
export type Viewer = { accountId: string; username: string; role: WorldRole };

/**
 * What a viewer may see of a token. Today the DM sees everything and a player sees the tokens that are not hidden.
 * Vision, light and fog of war (a later wave) change this function, not the code that calls it.
 */
export function tokenFor(viewer: Viewer, token: TokenView): TokenView | null {
  if (viewer.role === "dm") return token;
  return token.hidden ? null : token;
}

/** The tokens of a list that a viewer may see. */
export function tokensFor(viewer: Viewer, tokens: readonly TokenView[]): TokenView[] {
  return tokens.flatMap((t) => {
    const seen = tokenFor(viewer, t);
    return seen === null ? [] : [seen];
  });
}

/**
 * Whether a viewer may read a message. A reserved roll is for the DM and whoever made it. A whisper is for the one who
 * wrote it and the one it is addressed to, and for nobody else, the DM included.
 */
export function canSeeMessage(viewer: Viewer, message: MessageView): boolean {
  if (message.audience === "all") return true;
  if (message.audience === "gm") return viewer.role === "dm" || message.authorId === viewer.accountId;
  return message.authorId === viewer.accountId || message.recipientId === viewer.accountId;
}

export function messagesFor(viewer: Viewer, messages: readonly MessageView[]): MessageView[] {
  return messages.filter((m) => canSeeMessage(viewer, m));
}
