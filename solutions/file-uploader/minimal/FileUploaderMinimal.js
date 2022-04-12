import { Block } from '../../../blocks/index.js';

export class FileUploaderMinimal extends Block {
  init$ = {
    '*currentActivity': '',
    selectClicked: (e) => {
      e.preventDefault();
      this.openSystemDialog();
    },
  };

  initCallback() {
    this.$['*currentActivity'] = this.$['*--cfg-init-activity'];
  }
}

FileUploaderMinimal.template = /*html*/ `
  <uc-start-from>
    <uc-drop-area>
      <button 
        l10n="drop-files-here"
        set="onclick: selectClicked">
      </button>
    </uc-drop-area>
  </uc-start-from>
  <uc-upload-list></uc-upload-list>
  <uc-confirmation-dialog></uc-confirmation-dialog>
  <uc-message-box></uc-message-box>
`;