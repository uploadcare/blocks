// @ts-check
import { debounce } from '../blocks/utils/debounce.js';

const WINDOW_HEIGHT_TRACKER_PROPERTY = '--uploadcare-blocks-window-height';

export class WindowHeightTracker {
  /**
   * @private
   * @type {Set<unknown>}
   */
  static clientsRegistry = new Set();

  /** @private */
  static flush = debounce(() => {
    document.documentElement.style.setProperty(WINDOW_HEIGHT_TRACKER_PROPERTY, `${window.innerHeight}px`);
  }, 100);

  /**
   * @param {unknown} client
   * @public
   */
  static registerClient(client) {
    if (this.clientsRegistry.size === 0) {
      this.attachTracker();
    }
    this.clientsRegistry.add(client);
  }

  /**
   * @param {unknown} client
   * @public
   */
  static unregisterClient(client) {
    this.clientsRegistry.delete(client);
    if (this.clientsRegistry.size === 0) {
      this.detachTracker();
    }
  }

  /** @private */
  static attachTracker() {
    window.addEventListener('resize', this.flush, { passive: true, capture: true });
    this.flush();
  }

  /** @private */
  static detachTracker() {
    window.removeEventListener('resize', this.flush, { capture: true });
    document.documentElement.style.removeProperty(WINDOW_HEIGHT_TRACKER_PROPERTY);
  }
}
