import { BaseComponent, Data, TypedCollection } from '../../ext_modules/symbiote.js';
import { l10nProcessor } from './l10nProcessor.js';
import { uploadEntrySchema } from './uploadEntrySchema.js';

const ACTIVE_ATTR = 'active';
const TAG_PREFIX = 'uc-';
const CSS_ATTRIBUTE = 'css-src';

let DOC_READY = document.readyState === 'complete';
if (!DOC_READY) {
  window.addEventListener('load', () => {
    DOC_READY = true;
  });
}

let externalPropsAdded = false;

export class BlockComponent extends BaseComponent {
  l10n(str) {
    return this.getCssData('--l10n-' + str, true) || str;
  }

  constructor() {
    super();
    /** @type {String} */
    this.activityType = null;
    this.addTemplateProcessor(l10nProcessor);
    /** @type {String[]} */
    this.__l10nKeys = [];
    this.__l10nUpdate = () => {
      this.dropCssDataCache();
      for (let key of this.__l10nKeys) {
        this.notify(key);
      }
    };
    window.addEventListener('uc-l10n-update', this.__l10nUpdate);
  }

  /**
   * @param {String} localPropKey
   * @param {String} l10nKey
   */
  applyL10nKey(localPropKey, l10nKey) {
    this.$['l10n:' + localPropKey] = l10nKey;
  }

  historyBack() {
    /** @type {String[]} */
    let history = this.$['*history'];
    history.pop();
    let prevActivity = history.pop();
    this.$['*currentActivity'] = prevActivity;
    if (history.length > 10) {
      history = history.slice(history.length - 11, history.length - 1);
    }
    this.$['*history'] = history;
  }

  addFiles(files) {
    files.forEach((/** @type {File} */ file) => {
      this.uploadCollection.add({
        file,
        isImage: file.type.includes('image'),
        mimeType: file.type,
        fileName: file.name,
        fileSize: file.size,
      });
    });
  }

  openSystemDialog() {
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = !!this.cfg('multiple');
    this.fileInput.max = this.cfg('max-files');
    this.fileInput.accept = this.cfg('accept');
    this.fileInput.dispatchEvent(new MouseEvent('click'));
    this.fileInput.onchange = () => {
      this.addFiles([...this.fileInput['files']]);
      // To call uploadTrigger UploadList should draw file items first:
      this.$['*currentActivity'] = BlockComponent.activities.UPLOAD_LIST;
      if (!this.cfg('confirm-upload')) {
        this.$['*currentActivity'] = '';
      }
      this.fileInput['value'] = '';
      this.fileInput = null;
    };
  }

  connectedCallback() {
    let handleReadyState = () => {
      if (DOC_READY) {
        this.connected();
      } else {
        window.addEventListener('load', () => {
          this.connected();
        });
      }
    };
    let href = this.getAttribute(CSS_ATTRIBUTE);
    if (href) {
      this.renderShadow = true;
      this.attachShadow({
        mode: 'open',
      });
      let link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = href;
      link.onload = () => {
        // CSS modules can be not loaded at this moment
        // TODO: investigate better solution
        window.requestAnimationFrame(() => {
          handleReadyState();
        });
      };
      this.shadowRoot.appendChild(link);
    } else {
      handleReadyState();
    }
  }

  connected() {
    if (!this.__connectedOnce) {
      if (!BlockComponent._ctxConnectionsList.includes(this.ctxName)) {
        this.add$({
          '*currentActivity': '',
          '*currentActivityParams': {},
          '*history': [],
          '*commonProgress': 0,
          '*uploadList': [],
          '*outputData': null,
        });
        BlockComponent._ctxConnectionsList.push(this.ctxName);
      }

      super.connectedCallback();

      if (this.activityType) {
        if (!this.hasAttribute('activity')) {
          this.setAttribute('activity', this.activityType);
        }
        this.sub('*currentActivity', (/** @type {String} */ val) => {
          let activityKey = val ? this.ctxName + val : '';
          if (!val || this.activityType !== val) {
            this.removeAttribute(ACTIVE_ATTR);
          } else {
            /** @type {String[]} */
            let history = this.$['*history'];
            if (val && history[history.length - 1] !== val) {
              history.push(val);
            }
            this.setAttribute(ACTIVE_ATTR, '');

            let actDesc = BlockComponent._activityRegistry[activityKey];
            if (actDesc) {
              actDesc.activateCallback?.();
              if (BlockComponent._lastActivity) {
                let lastActDesc = BlockComponent._activityRegistry[BlockComponent._lastActivity];
                if (lastActDesc) {
                  lastActDesc.deactivateCallback?.();
                }
              }
            }
          }
          BlockComponent._lastActivity = activityKey;
        });
      }
      this.__connectedOnce = true;
    } else {
      super.connectedCallback();
    }
  }

  get doneActivity() {
    return this.getAttribute('done-activity');
  }

  get cancelActivity() {
    return this.getAttribute('cancel-activity');
  }

  /**
   * @param {String} name
   * @param {() => void} [activateCallback]
   * @param {() => void} [deactivateCallback]
   */
  registerActivity(name, activateCallback, deactivateCallback) {
    if (!BlockComponent._activityRegistry) {
      BlockComponent._activityRegistry = Object.create(null);
    }
    let actKey = this.ctxName + name;
    BlockComponent._activityRegistry[actKey] = {
      activateCallback,
      deactivateCallback,
    };
  }

  get activityParams() {
    return this.$['*currentActivityParams'];
  }

  /** @type {import('../../ext_modules/symbiote.js').TypedCollection} */
  get uploadCollection() {
    if (!this.has('*uploadCollection')) {
      let uploadCollection = new TypedCollection({
        typedSchema: uploadEntrySchema,
        watchList: ['uploadProgress', 'uuid'],
        handler: (entries) => {
          this.$['*uploadList'] = entries;
        },
      });
      uploadCollection.observe((changeMap) => {
        if (changeMap.uploadProgress) {
          let commonProgress = 0;
          /** @type {String[]} */
          let items = uploadCollection.findItems((entry) => {
            return !entry.getValue('uploadError');
          });
          items.forEach((id) => {
            commonProgress += uploadCollection.readProp(id, 'uploadProgress');
          });
          this.$['*commonProgress'] = commonProgress / items.length;
        }
      });
      this.add('*uploadCollection', uploadCollection);
    }
    return this.$['*uploadCollection'];
  }

  /** @param {String} shortKey */
  cfg(shortKey) {
    return this.getCssData('--cfg-' + shortKey, true);
  }

  /**
   * @param {Number} bytes
   * @param {Number} [decimals]
   */
  fileSizeFmt(bytes, decimals = 2) {
    let units = ['B', 'KB', 'MB', 'GB', 'TB'];
    /**
     * @param {String} str
     * @returns {String}
     */
    let getUnit = (str) => {
      return this.getCssData('--l10n-unit-' + str.toLowerCase(), true) || str;
    };
    if (bytes === 0) {
      return `0 ${getUnit(units[0])}`;
    }
    let k = 1024;
    let dm = decimals < 0 ? 0 : decimals;
    let i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / k ** i).toFixed(dm)) + ' ' + getUnit(units[i]);
  }

  output() {
    let data = [];
    let items = this.uploadCollection.items();
    items.forEach((itemId) => {
      let uploadEntryData = Data.getNamedCtx(itemId).store;
      let info = uploadEntryData.fileInfo;
      data.push(info);
    });
    this.$['*outputData'] = data;
  }

  destroyCallback() {
    window.removeEventListener('uc-l10n-update', this.__l10nUpdate);
    this.__l10nKeys = null;
    // TODO: destroy uploadCollection
  }

  static reg(name) {
    super.reg(name.startsWith(TAG_PREFIX) ? name : TAG_PREFIX + name);
  }
}

/** @type {{ string: { activateCallback: Function; deactivateCallback: Function } }} */
BlockComponent._activityRegistry = Object.create(null);

/** @type {String} */
BlockComponent._lastActivity = '';

/** @type {String[]} */
BlockComponent._ctxConnectionsList = [];

BlockComponent.activities = Object.freeze({
  SOURCE_SELECT: 'source-select',
  CAMERA: 'camera',
  DRAW: 'draw',
  UPLOAD_LIST: 'upload-list',
  URL: 'url',
  CONFIRMATION: 'confirmation',
  CLOUD_IMG_EDIT: 'cloud-image-edit',
  EXTERNAL: 'external',
  DETAILS: 'details',
});

BlockComponent.extSrcList = Object.freeze({
  FACEBOOK: 'facebook',
  DROPBOX: 'dropbox',
  GDRIVE: 'gdrive',
  GPHOTOS: 'gphotos',
  INSTAGRAM: 'instagram',
  FLICKR: 'flickr',
  VK: 'vk',
  EVERNOTE: 'evernote',
  BOX: 'box',
  ONEDRIVE: 'onedrive',
  HUDDLE: 'huddle',
});

BlockComponent.sourceTypes = Object.freeze({
  LOCAL: 'local',
  URL: 'url',
  CAMERA: 'camera',
  DRAW: 'draw',
  ...BlockComponent.extSrcList,
});
