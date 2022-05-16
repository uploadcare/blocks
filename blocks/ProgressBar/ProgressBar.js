import { Block } from '../../abstract/Block.js';

/**
 * @typedef {{
 *   width: Number;
 *   opacity: Number;
 * }} State
 */

/** @extends {Block<State>} */
export class ProgressBar extends Block {
  /** @type {Number} */
  _value = 0;
  /** @type {Boolean} */
  _unknownMode = false;

  /** @type {State} */
  init$ = {
    width: 0,
    opacity: 0,
  };

  initCallback() {
    this.defineAccessor('value', (value) => {
      if (value === undefined) {
        return;
      }
      this._value = value;

      if (!this._unknownMode) {
        this.style.setProperty('--l-width', this._value.toString());
      }
    });
    this.defineAccessor('visible', (visible) => {
      this.ref.line.classList.toggle('progress--hidden', !visible);
    });
    this.defineAccessor('unknown', (unknown) => {
      this._unknownMode = unknown;
      this.ref.line.classList.toggle('progress--unknown', unknown);
    });
  }
}

ProgressBar.template = /*html*/ `
<div
  ref="line"
  class="progress">
</div>
`;
