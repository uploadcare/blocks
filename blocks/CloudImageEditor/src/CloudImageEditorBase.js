// @ts-check
import { DICT, PubSub } from '@symbiotejs/symbiote';
import { Block } from '../../../abstract/Block.js';

const CSS_CFG_CTX_NAME = DICT.CTX_NAME_ATTR.replace('--', '--cfg-');

export class CloudImageEditorBase extends Block {
  /**
   * @private
   * @returns {string}
   */
  get cfgCssCtxName() {
    return this.getCssData(CSS_CFG_CTX_NAME, true);
  }

  /** @private */
  get cfgCtxName() {
    const ctxName = this.getAttribute(DICT.CTX_NAME_ATTR)?.trim() || this.cfgCssCtxName || this.__cachedCfgCtxName;
    /**
     * Cache last ctx name to be able to access context when element becames disconnected
     *
     * @type {String}
     */
    this.__cachedCfgCtxName = ctxName;
    return ctxName;
  }

  connectedCallback() {
    if (!this.connectedOnce) {
      const ctxName = this.getAttribute(DICT.CTX_NAME_ATTR)?.trim();
      if (ctxName) {
        this.style.setProperty(CSS_CFG_CTX_NAME, `'${ctxName}'`);
      }
    }

    super.connectedCallback();
  }

  /**
   * Resolve cfg from context passed with ctx-name attribute
   *
   * @param {String} prop
   * @returns {any}
   * @protected
   */
  parseCfgProp(prop) {
    if (!this.cfgCtxName) {
      throw new Error(`Context name is not defined for ${this.tagName.toLowerCase()}`);
    }
    const parsed = {
      ...super.parseCfgProp(prop),
      ctx: PubSub.getCtx(this.cfgCtxName),
    };
    return parsed;
  }
}
