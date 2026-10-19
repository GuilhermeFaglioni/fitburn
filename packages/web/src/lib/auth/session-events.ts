type SessionEndedListener = () => void;

const sessionEndedListeners = new Set<SessionEndedListener>();

export function onSessionEnded(listener: SessionEndedListener): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

export function emitSessionEnded(): void {
  for (const listener of sessionEndedListeners) {
    listener();
  }
}
