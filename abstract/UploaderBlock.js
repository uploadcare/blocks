import { ActivityBlock } from './ActivityBlock.js';

import { Data } from '@symbiotejs/symbiote';
import { mergeMimeTypes } from '../utils/mergeMimeTypes.js';
import { imageMimeTypes } from '../utils/imageMimeTypes.js';
import { uploadEntrySchema } from './uploadEntrySchema.js';
import { customUserAgent } from '../blocks/utils/userAgent.js';
import { TypedCollection } from './TypedCollection.js';
import { UPLOADER_BLOCK_CTX } from './CTX.js';
import { EVENT_TYPES, EventData, EventManager } from './EventManager.js';

export class UploaderBlock extends ActivityBlock {
  ctxInit = UPLOADER_BLOCK_CTX;

  /** @private */
  __initialUploadMetadata = null;

  /**
   * This is Public JS API method. Could be called before block initialization, so we need to delay state interactions
   * until block init.
   *
   * TODO: If we add more public methods, it is better to use the single queue instead of tonns of private fields per
   * each method. See https://github.com/uploadcare/uc-blocks/pull/162/
   *
   * @param {import('@uploadcare/upload-client').Metadata} metadata
   * @public
   */
  setUploadMetadata(metadata) {
    if (!this.connectedOnce) {
      this.__initialUploadMetadata = metadata;
    } else {
      this.$['*uploadMetadata'] = metadata;
    }
  }

  initCallback() {
    super.initCallback();
    if (this.__initialUploadMetadata) {
      this.$['*uploadMetadata'] = this.__initialUploadMetadata;
    }
  }

  /** @param {File[]} files */
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
    let accept = mergeMimeTypes(
      this.getCssData('--cfg-img-only') && imageMimeTypes.join(','),
      this.getCssData('--cfg-accept')
    );
    if (this.getCssData('--cfg-accept') && !!this.getCssData('--cfg-img-only')) {
      console.warn(
        'There could be a mistake.\n' +
          'Both `--cfg-accept` and `--cfg-img-only` parameters are set.\n' +
          'The value of `--cfg-accept` will be concatenated with the internal image mime types list.'
      );
    }
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = !!this.getCssData('--cfg-multiple');
    this.fileInput.accept = accept;
    this.fileInput.dispatchEvent(new MouseEvent('click'));
    this.fileInput.onchange = () => {
      this.addFiles([...this.fileInput['files']]);
      // To call uploadTrigger UploadList should draw file items first:
      this.$['*currentActivity'] = ActivityBlock.activities.UPLOAD_LIST;
      this.fileInput['value'] = '';
      this.fileInput = null;
    };
  }

  /** @type {String[]} */
  get sourceList() {
    let list = null;
    if (this.getCssData('--cfg-source-list')) {
      list = this.getCssData('--cfg-source-list')
        .split(',')
        .map((/** @type {String} */ item) => {
          return item.trim();
        });
    }
    return list;
  }

  /** @param {Boolean} [force] */
  initFlow(force = false) {
    if (this.$['*uploadList']?.length && !force) {
      this.set$({
        '*currentActivity': ActivityBlock.activities.UPLOAD_LIST,
      });
      this.setForCtxTarget('lr-modal', '*modalActive', true);
    } else {
      if (this.sourceList?.length === 1) {
        let srcKey = this.sourceList[0];
        // Single source case:
        if (srcKey === 'local') {
          this.$['*currentActivity'] = ActivityBlock.activities.UPLOAD_LIST;
          this?.['openSystemDialog']();
        } else {
          /** @ts-ignore */
          if (Object.values(Block.extSrcList).includes(srcKey)) {
            this.set$({
              '*currentActivityParams': {
                externalSourceType: srcKey,
              },
              '*currentActivity': ActivityBlock.activities.EXTERNAL,
            });
          } else {
            this.$['*currentActivity'] = srcKey;
          }
          this.setForCtxTarget('lr-modal', '*modalActive', true);
        }
      } else {
        // Multiple sources case:
        this.set$({
          '*currentActivity': ActivityBlock.activities.START_FROM,
        });
        this.setForCtxTarget('lr-modal', '*modalActive', true);
      }
    }
  }

  cancelFlow() {
    if (this.sourceList?.length === 1) {
      this.$['*currentActivity'] = null;
      this.setForCtxTarget('lr-modal', '*modalActive', false);
    } else {
      this.historyBack();
      if (!this.$['*currentActivity']) {
        this.setForCtxTarget('lr-modal', '*modalActive', false);
      }
    }
  }

  /** @returns {TypedCollection} */
  get uploadCollection() {
    if (!this.has('*uploadCollection')) {
      let uploadCollection = new TypedCollection({
        typedSchema: uploadEntrySchema,
        watchList: ['uploadProgress', 'uuid', 'uploadErrorMsg', 'validationErrorMsg', 'cdnUrlModifiers'],
        handler: (entries) => {
          this.$['*uploadList'] = entries.map((uid) => {
            return { uid };
          });
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
          let progress = Math.round(commonProgress / items.length);
          this.$['*commonProgress'] = progress;
          EventManager.emit(
            new EventData({
              type: EVENT_TYPES.UPLOAD_PROGRESS,
              ctx: this.ctxName,
              data: progress,
            }),
            undefined,
            progress === 100
          );
        }
        if (changeMap.uuid) {
          let loadedItems = uploadCollection.findItems((entry) => {
            return !!entry.getValue('uuid');
          });
          let errorItems = uploadCollection.findItems((entry) => {
            return !!entry.getValue('uploadErrorMsg') || !!entry.getValue('validationErrorMsg');
          });
          if (uploadCollection.size - errorItems.length === loadedItems.length) {
            let data = this.getOutputData((dataItem) => {
              return !!dataItem.getValue('uuid');
            });
            EventManager.emit(
              new EventData({
                type: EVENT_TYPES.UPLOAD_FINISH,
                ctx: this.ctxName,
                data,
              })
            );
          }
        }
        if (changeMap.uploadErrorMsg) {
          let items = uploadCollection.findItems((entry) => {
            return !!entry.getValue('uploadErrorMsg');
          });
          items.forEach((id) => {
            EventManager.emit(
              new EventData({
                type: EVENT_TYPES.UPLOAD_ERROR,
                ctx: this.ctxName,
                data: uploadCollection.readProp(id, 'uploadErrorMsg'),
              }),
              undefined,
              false
            );
          });
        }
        if (changeMap.validationErrorMsg) {
          let items = uploadCollection.findItems((entry) => {
            return !!entry.getValue('validationErrorMsg');
          });
          items.forEach((id) => {
            EventManager.emit(
              new EventData({
                type: EVENT_TYPES.VALIDATION_ERROR,
                ctx: this.ctxName,
                data: uploadCollection.readProp(id, 'validationErrorMsg'),
              }),
              undefined,
              false
            );
          });
        }
        if (changeMap.cdnUrlModifiers) {
          let items = uploadCollection.findItems((entry) => {
            return !!entry.getValue('cdnUrlModifiers');
          });
          items.forEach((id) => {
            EventManager.emit(
              new EventData({
                type: EVENT_TYPES.CDN_MODIFICATION,
                ctx: this.ctxName,
                data: uploadCollection.readProp(id, 'cdnUrlModifiers'),
              }),
              undefined,
              false
            );
          });
        }
      });
      this.add('*uploadCollection', uploadCollection);
    }
    return this.$['*uploadCollection'];
  }

  /** @returns {import('@uploadcare/upload-client').FileFromOptions} */
  getUploadClientOptions() {
    let storeSetting = {};
    let store = this.getCssData('--cfg-store');
    if (store !== null) {
      storeSetting.store = !!store;
    }

    let options = {
      ...storeSetting,
      publicKey: this.getCssData('--cfg-pubkey'),
      baseCDN: this.getCssData('--cfg-cdn-cname'),
      baseURL: this.getCssData('--cfg-base-url'),
      userAgent: customUserAgent,
      integration: this.getCssData('--cfg-user-agent-integration'),
      secureSignature: this.getCssData('--cfg-secure-signature'),
      secureExpire: this.getCssData('--cfg-secure-expire'),
      retryThrottledRequestMaxTimes: this.getCssData('--cfg-retry-throttled-request-max-times'),
      multipartMinFileSize: this.getCssData('--cfg-multipart-min-file-size'),
      multipartChunkSize: this.getCssData('--cfg-multipart-chunk-size'),
      maxConcurrentRequests: this.getCssData('--cfg-max-concurrent-requests'),
      multipartMaxAttempts: this.getCssData('--cfg-multipart-max-attempts'),
      checkForUrlDuplicates: !!this.getCssData('--cfg-check-for-url-duplicates'),
      saveUrlForRecurrentUploads: !!this.getCssData('--cfg-save-url-for-recurrent-uploads'),
      metadata: this.$['*uploadMetadata'],
    };

    console.log('Upload client options:', options);

    return options;
  }

  /** @param {(item: import('./TypedData.js').TypedData) => Boolean} checkFn */
  getOutputData(checkFn) {
    let data = [];
    let items = this.uploadCollection.findItems(checkFn);
    items.forEach((itemId) => {
      let uploadEntryData = Data.getCtx(itemId).store;
      /** @type {import('@uploadcare/upload-client').UploadcareFile} */
      let fileInfo = uploadEntryData.fileInfo || {
        name: uploadEntryData.fileName,
        fileSize: uploadEntryData.fileSize,
        isImage: uploadEntryData.isImage,
        mimeType: uploadEntryData.mimeType,
      };
      let outputItem = {
        ...fileInfo,
        cdnUrlModifiers: uploadEntryData.cdnUrlModifiers,
        cdnUrl: uploadEntryData.cdnUrl || fileInfo.cdnUrl,
      };
      data.push(outputItem);
    });
    return data;
  }
}

/** @enum {String} */
UploaderBlock.sourceTypes = Object.freeze({
  LOCAL: 'local',
  URL: 'url',
  CAMERA: 'camera',
  DRAW: 'draw',
  ...UploaderBlock.extSrcList,
});

/** @enum {String} */
UploaderBlock.extSrcList = Object.freeze({
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

Object.keys(EVENT_TYPES).forEach((eType) => {
  let eName = EventManager.eName(eType);
  window.addEventListener(eName, (e) => {
    let outputTypes = [EVENT_TYPES.UPLOAD_FINISH, EVENT_TYPES.REMOVE];
    if (outputTypes.includes(e.detail.type)) {
      let dataCtx = Data.getCtx(e.detail.ctx);
      /** @type {TypedCollection} */
      let uploadCollection = dataCtx.read('uploadCollection');
      let data = [];
      uploadCollection.items().forEach((id) => {
        let uploadEntryData = Data.getCtx(id).store;
        /** @type {import('@uploadcare/upload-client').UploadcareFile} */
        let fileInfo = uploadEntryData.fileInfo;
        if (fileInfo) {
          let outputItem = {
            ...fileInfo,
            cdnUrlModifiers: uploadEntryData.cdnUrlModifiers,
            cdnUrl: uploadEntryData.cdnUrl || fileInfo.cdnUrl,
          };
          data.push(outputItem);
        }
      });
      EventManager.emit(
        new EventData({
          type: EVENT_TYPES.DATA_OUTPUT,
          ctx: e.detail.ctx,
          data,
        })
      );
      dataCtx.pub('outputData', data);
    }
  });
});
