import { html } from '@symbiotejs/symbiote';
import { ActivityBlock } from '../../abstract/ActivityBlock.js';

export class StartFrom extends ActivityBlock {
  historyTracked = true;
  activityType = 'start-from';

  initCallback() {
    super.initCallback();
    this.registerActivity(this.activityType);
  }
}

StartFrom.template = html` <div class="content"><slot></slot></div> `;
