// Blocked-users list. Small and REST-only (no live socket push for this) —
// blocking is a rare, self-initiated action, so a refetch after mutating is
// simple and sufficient.

import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { api } from "../data/api";
import type { BlockDto } from "../data/types";
import { chatsStore } from "./chats";

interface BlocksState {
  blocks: BlockDto[];
  loaded: boolean;
}

function createBlocksStore() {
  const [state, setState] = createStore<BlocksState>({ blocks: [], loaded: false });

  const refresh = async () => {
    const blocks = await api.listBlocks();
    setState({ blocks, loaded: true });
  };

  const isBlocked = (userId: string) => state.blocks.some((b) => b.user.id === userId);

  const block = async (userId: string) => {
    await api.blockUser(userId);
    await Promise.all([refresh(), chatsStore.refresh()]);
  };

  const unblock = async (userId: string) => {
    await api.unblockUser(userId);
    await Promise.all([refresh(), chatsStore.refresh()]);
  };

  return { state, refresh, isBlocked, block, unblock };
}

export const blocksStore = createRoot(createBlocksStore);
