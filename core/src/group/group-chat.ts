export interface GroupMember {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export type GroupSpeaker =
  | { readonly kind: "user"; readonly name?: string }
  | { readonly kind: "member"; readonly id: string; readonly name: string };

export interface GroupMessage {
  readonly speaker: GroupSpeaker;
  readonly content: string;
}
