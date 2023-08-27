export interface Linking {
  open(url: string): void;
}

export type MessageData = {
  id: string;
} & ({ ok: object } | { err: string });

export interface Message {
  receive(listener: (data: MessageData) => void): () => void;
}
