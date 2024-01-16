import { html } from '@symbiotejs/symbiote';
import { Block } from '../../abstract/Block.js';

export class Select extends Block {
  init$ = {
    ...this.init$,
    currentText: '',
    options: [],
    selectHtml: '',
    onSelect: (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.value = this.ref.select.value;
      this.$.currentText =
        this.$.options.find((opt) => {
          return opt.value == this.value;
        })?.text || '';
      this.dispatchEvent(new Event('change'));
    },
  };

  initCallback() {
    super.initCallback();

    this.sub('options', (/** @type {{ text: String; value: String }[]} */ options) => {
      this.$.currentText = options?.[0]?.text || '';
      let html = '';
      options?.forEach((opt) => {
        html += html`<option value="${opt.value}">${opt.text}</option>`;
      });
      this.$.selectHtml = html;
    });
  }
}

Select.template = html`
  <button>
    {{currentText}}
    <lr-icon name="select"></lr-icon>
    <select ref="select" bind="innerHTML: selectHtml; onchange: onSelect"></select>
  </button>
`;
