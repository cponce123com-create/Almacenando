/**
 * Notification Events — EventEmitter en memoria para SSE
 *
 * Cada vez que se crea una notificación (desde POST /api/notifications
 * o desde scheduled-jobs), este emisor notifica a todos los clientes
 * SSE conectados para que actualicen al instante, sin polling a la BD.
 */
import { EventEmitter } from "events";

export interface NotificationEvent {
  type: "notification_created";
  notification: {
    id: string;
    title: string;
    message: string;
    type: string;
    userId?: string | null;
    createdAt: string;
  };
}

const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(200); // Soporta más conexiones SSE concurrentes

export const NOTIFICATION_EVENT = "notification";

export function emitNotification(notification: NotificationEvent["notification"]): void {
  notificationEmitter.emit(NOTIFICATION_EVENT, { type: "notification_created", notification } satisfies NotificationEvent);
}

export function onNotification(callback: (event: NotificationEvent) => void): () => void {
  notificationEmitter.on(NOTIFICATION_EVENT, callback);
  // Return unsubscribe function
  return () => { notificationEmitter.off(NOTIFICATION_EVENT, callback); };
}

export default notificationEmitter;
