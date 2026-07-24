/**
 * Repository seam between UI and the backend. The mock implementation is gone:
 * everything below is HTTP against atlas-server (realtime updates arrive
 * separately via the WebSocket -> stores). Screens that only need reads can
 * keep using this; live state lives in src/store/*.
 */

import { api } from "./api";
import { NOTIFICATION_SOUNDS, WALLPAPERS } from "./staticData";
import type { NotificationSound, User, Wallpaper } from "./types";
import type { UserDto } from "./generated";

function toUser(dto: UserDto): User {
  return {
    id: dto.id,
    name: dto.name,
    handle: `@${dto.handle}`,
    status: dto.status,
    bio: dto.bio,
    avatarColor: dto.avatarColor,
    avatarInitial: dto.avatarInitial,
    hasAvatar: dto.hasAvatar,
    lastSeenAt: dto.lastSeenAt,
  };
}

export const repository = {
  async getUser(userId: string): Promise<User> {
    return toUser(await api.getUser(userId));
  },

  async getCurrentUser(): Promise<User> {
    return toUser(await api.me());
  },

  async updateCurrentUser(patch: Partial<User>): Promise<User> {
    return toUser(
      await api.updateMe({
        name: patch.name,
        bio: patch.bio,
        status: patch.status,
        avatarColor: patch.avatarColor,
        avatarInitial: patch.avatarInitial,
      }),
    );
  },

  async searchUsers(query: string): Promise<User[]> {
    return (await api.searchUsers(query)).map(toUser);
  },

  async listNotificationSounds(): Promise<NotificationSound[]> {
    return NOTIFICATION_SOUNDS;
  },

  async listWallpapers(): Promise<Wallpaper[]> {
    return WALLPAPERS;
  },
};
