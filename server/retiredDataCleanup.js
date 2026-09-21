export const RETIRED_NOTIFICATION_HISTORY_COLLECTION = "notificationHistory";

export async function removeRetiredNotificationHistory(db) {
  if (!db || typeof db.dropCollection !== "function") {
    throw new TypeError("A MongoDB database is required to remove retired alert history data.");
  }

  return db.dropCollection(RETIRED_NOTIFICATION_HISTORY_COLLECTION);
}
