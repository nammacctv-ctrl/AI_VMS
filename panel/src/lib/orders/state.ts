export type OrderStatus = "pending" | "processing" | "completed" | "failed";

const NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: [],
  failed: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => NEXT[from].includes(to);
export const isTerminal = (s: OrderStatus) => NEXT[s].length === 0;
