import { Block } from '../../abstract/Block.js';

export class UiConfirmation {
  captionL10nStr = 'confirm-your-action';
  messageL10Str = 'are-you-sure';
  confirmL10nStr = 'yes';
  denyL10nStr = 'no';
  confirmAction() {
    console.log('Confirmed');
  }
  denyAction() {
    this['historyBack']();
  }
}

/**
 * @typedef {{
 *   messageTxt: String;
 *   confirmBtnTxt: String;
 *   denyBtnTxt: String;
 *   '*confirmation': UiConfirmation;
 *   onConfirm: () => void;
 *   onDeny: () => void;
 * }} State
 */

/**
 * @extends {Block<
 *   State & Partial<import('../Modal/Modal').State> & Partial<import('../ActivityCaption/ActivityCaption').State>
 * >}
 */
export class ConfirmationDialog extends Block {
  activityType = Block.activities.CONFIRMATION;

  /** @private */
  _defaults = new UiConfirmation();

  /** @type {State} */
  init$ = {
    messageTxt: '',
    confirmBtnTxt: '',
    denyBtnTxt: '',
    '*confirmation': null,
    onConfirm: this._defaults.confirmAction,
    onDeny: this._defaults.denyAction.bind(this),
  };

  initCallback() {
    super.initCallback();
    this.set$({
      messageTxt: this.l10n(this._defaults.messageL10Str),
      confirmBtnTxt: this.l10n(this._defaults.confirmL10nStr),
      denyBtnTxt: this.l10n(this._defaults.denyL10nStr),
    });
    this.sub('*confirmation', (/** @type {UiConfirmation} */ cfn) => {
      if (!cfn) {
        return;
      }
      this.set$({
        '*modalHeaderHidden': true,
        '*currentActivity': Block.activities.CONFIRMATION,
        '*activityCaption': this.l10n(cfn.captionL10nStr),
        messageTxt: this.l10n(cfn.messageL10Str),
        confirmBtnTxt: this.l10n(cfn.confirmL10nStr),
        denyBtnTxt: this.l10n(cfn.denyL10nStr),
        onDeny: () => {
          this.$['*modalHeaderHidden'] = false;
          cfn.denyAction();
        },
        onConfirm: () => {
          this.$['*modalHeaderHidden'] = false;
          cfn.confirmAction();
        },
      });
    });
  }
}

ConfirmationDialog.template = /*html*/ `
<div class="message">{{messageTxt}}</div>
<div class="toolbar">
  <button
    class="deny-btn secondary-btn"
    set="onclick: onDeny">{{denyBtnTxt}}</button>
  <button
    class="confirm-btn primary-btn"
    set="onclick: onConfirm">{{confirmBtnTxt}}</button>
</div>
`;
