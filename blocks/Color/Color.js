import { html } from '@symbiotejs/symbiote';
import { Block } from '../../abstract/Block.js';

export class Color extends Block {
  init$ = {
    ...this.init$,
    inputOpacity: 0,
    '*selectedColor': '#f00',
    onChange: () => {
      this.$['*selectedColor'] = this.ref.input['value'];
    },
  };
}

Color.template = html`
  <input ref="input" type="color" bind="oninput: onChange; style.opacity: inputOpacity" />
  <div class="current-color" bind="style.backgroundColor: *selectedColor"></div>
`;
