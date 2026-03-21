import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const funeralSongsTable = pgTable("funeral_songs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  youtubeVideoId: text("youtube_video_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  durationSeconds: integer("duration_seconds"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FuneralSong = typeof funeralSongsTable.$inferSelect;
