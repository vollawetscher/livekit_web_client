import { savePushSubscription, removePushSubscription } from './supabase';

export class NotificationManager {
  private userId: string;
  private registration: ServiceWorkerRegistration | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered');
      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return 'denied';
    }

    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      await this.subscribeToPush();
    }

    return permission;
  }

  private async subscribeToPush() {
    if (!this.registration) {
      throw new Error('Service Worker not registered');
    }

    try {
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
        ),
      });

      const subscriptionData = subscription.toJSON();

      await savePushSubscription({
        user_id: this.userId,
        endpoint: subscription.endpoint,
        p256dh_key: subscriptionData.keys?.p256dh || '',
        auth_key: subscriptionData.keys?.auth || '',
        user_agent: navigator.userAgent,
      });

      console.log('Push subscription saved');
    } catch (error) {
      console.error('Failed to subscribe to push:', error);
    }
  }

  async unsubscribe() {
    if (!this.registration) {
      return;
    }

    try {
      const subscription = await this.registration.pushManager.getSubscription();

      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
        console.log('Unsubscribed from push notifications');
      }
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
    }
  }

  showNotification(title: string, options?: NotificationOptions) {
    if (!('Notification' in window)) {
      return;
    }
    if (Notification.permission === 'granted') {
      new Notification(title, options);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  get permission(): NotificationPermission {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }
}
