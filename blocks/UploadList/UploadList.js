import { UploaderBlock } from '../../abstract/UploaderBlock.js';
import { ActivityBlock } from '../../abstract/ActivityBlock.js';
import { UiConfirmation } from '../ConfirmationDialog/ConfirmationDialog.js';
import { UiMessage } from '../MessageBox/MessageBox.js';
import { EVENT_TYPES, EventData, EventManager } from '../../abstract/EventManager.js';
import { debounce } from '../utils/debounce.js';

export class UploadList extends UploaderBlock {
  activityType = ActivityBlock.activities.UPLOAD_LIST;

  init$ = {
    ...this.ctxInit,
    doneBtnHidden: false,
    doneBtnDisabled: false,
    uploadBtnHidden: false,
    uploadBtnDisabled: false,
    addMoreBtnHidden: false,
    addMoreBtnDisabled: false,

    hasFiles: false,
    onAdd: () => {
      this.initFlow(true);
    },
    onUpload: () => {
      this.$['*uploadTrigger'] = {};
      this._updateUploadsState();
    },
    onDone: () => {
      this.cancelFlow();
    },
    onCancel: () => {
      let cfn = new UiConfirmation();
      cfn.confirmAction = () => {
        let data = this.getOutputData((dataItem) => {
          return !!dataItem.getValue('uuid');
        });
        EventManager.emit(
          new EventData({
            type: EVENT_TYPES.REMOVE,
            ctx: this.ctxName,
            data,
          })
        );
        this.uploadCollection.clearAll();
        this.historyBack();
      };
      cfn.denyAction = () => {
        this.historyBack();
      };
      this.$['*confirmation'] = cfn;
    },
  };

  cssInit$ = {
    '--cfg-show-empty-list': 0,
    '--cfg-multiple': 1,
    '--cfg-multiple-min': 0,
    '--cfg-multiple-max': 0,
    '--cfg-confirm-upload': 1,
    '--cfg-source-list': '',
  };

  _debouncedHandleCollectionUpdate = debounce(() => {
    this._updateUploadsState();
    this._updateCountLimitMessage();
  }, 0);

  /**
   * @private
   * @returns {{ passed: Boolean; tooFew: Boolean; tooMany: Boolean; exact: Boolean; min: Number; max: Number }}
   */
  _validateFilesCount() {
    let multiple = !!this.getCssData('--cfg-multiple');
    let min = multiple ? this.getCssData('--cfg-multiple-min') ?? 0 : 1;
    let max = multiple ? this.getCssData('--cfg-multiple-max') ?? 0 : 1;
    let count = this.uploadCollection.size;

    let tooFew = min ? count < min : false;
    let tooMany = max ? count > max : false;
    let passed = !tooFew && !tooMany;
    let exact = max === count;

    return {
      passed,
      tooFew,
      tooMany,
      min,
      max,
      exact,
    };
  }

  /** @private */
  _updateCountLimitMessage() {
    let filesCount = this.uploadCollection.size;
    let countValidationResult = this._validateFilesCount();
    if (filesCount && !countValidationResult.passed) {
      let msg = new UiMessage();
      let textKey = countValidationResult.tooFew
        ? 'files-count-limit-error-too-few'
        : 'files-count-limit-error-too-many';
      msg.caption = this.l10n('files-count-limit-error-title');
      msg.text = this.l10n(textKey, {
        min: countValidationResult.min,
        max: countValidationResult.max,
        total: filesCount,
      });
      msg.isError = true;
      this.set$({
        '*message': msg,
      });
    }
  }

  /** @private */
  _updateUploadsState() {
    let itemIds = this.uploadCollection.items();
    let filesCount = itemIds.length;
    let summary = {
      total: filesCount,
      uploaded: 0,
      uploading: 0,
      validationFailed: 0,
    };
    for (let id of itemIds) {
      let item = this.uploadCollection.read(id);
      if (item.getValue('uuid')) {
        summary.uploaded += 1;
      } else if (item.getValue('isUploading')) {
        summary.uploading += 1;
      }
      if (item.getValue('validationErrorMsg')) {
        summary.validationFailed += 1;
      }
    }
    let allUploaded = summary.total === summary.uploaded;
    let { passed: fitCountRestrictions, tooMany, exact } = this._validateFilesCount();
    let fitValidation = summary.validationFailed === 0;

    this.set$({
      doneBtnHidden: !allUploaded,
      doneBtnDisabled: summary.total === 0 || !fitCountRestrictions || !fitValidation,

      uploadBtnHidden: allUploaded,
      uploadBtnDisabled:
        summary.uploading + summary.uploaded === summary.total || !fitCountRestrictions || !fitValidation,

      addMoreBtnDisabled: summary.total > 0 && (tooMany || exact),
      addMoreBtnHidden: exact && !this.getCssData('--cfg-multiple'),
    });
  }

  initCallback() {
    super.initCallback();

    this.registerActivity(this.activityType, {
      onActivate: () => {
        this.set$({
          '*activityCaption': this.l10n('selected'),
          '*activityIcon': 'local',
        });
      },
    });

    this.sub('--cfg-multiple', this._debouncedHandleCollectionUpdate);
    this.sub('--cfg-multiple-min', this._debouncedHandleCollectionUpdate);
    this.sub('--cfg-multiple-max', this._debouncedHandleCollectionUpdate);

    this.sub('*currentActivity', (currentActivity) => {
      if (
        this.uploadCollection?.size === 0 &&
        !this.getCssData('--cfg-show-empty-list') &&
        currentActivity === this.activityType
      ) {
        this.$['*currentActivity'] = this.initActivity;
      }
    });

    // TODO: could be performance issue on many files
    // there is no need to update buttons state on every progress tick
    this.uploadCollection.observe(this._debouncedHandleCollectionUpdate);

    this.sub('*uploadList', (list) => {
      this._debouncedHandleCollectionUpdate();

      this.set$({
        hasFiles: list.length > 0,
      });

      if (list?.length === 0 && !this.getCssData('--cfg-show-empty-list')) {
        this.cancelFlow();
      }
    });
  }

  destroyCallback() {
    super.destroyCallback();
    this.uploadCollection.unobserve(this._debouncedHandleCollectionUpdate);
  }
}

UploadList.template = /*html*/ `
<div class="no-files" set="@hidden: hasFiles">
  <slot name="empty"><span l10n="no-files"></span></slot>
</div>

<div
  class="files"
  repeat="*uploadList"
  repeat-item-tag="lr-file-item"></div>

<div class="toolbar">
  <button
    type="button"
    class="cancel-btn secondary-btn"
    set="onclick: onCancel;"
    l10n="clear"></button>
  <div class="toolbar-spacer"></div>
  <button
    type="button"
    class="add-more-btn secondary-btn"
    set="onclick: onAdd; @disabled: addMoreBtnDisabled; @hidden: addMoreBtnHidden"
    l10n="add-more"></button>
  <button
    type="button"
    class="upload-btn primary-btn"
    set="@hidden: uploadBtnHidden; onclick: onUpload; @disabled: uploadBtnDisabled"
    l10n="upload"></button>
  <button
    type="button"
    class="done-btn primary-btn"
    set="@hidden: doneBtnHidden; onclick: onDone;  @disabled: doneBtnDisabled"
    l10n="done"></button>
</div>
`;
