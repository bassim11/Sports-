export interface M3uChannel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
}

export interface PlaylistSummary {
  name: string;
  channelCount: number;
}
