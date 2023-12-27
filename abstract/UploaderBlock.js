// @ts-check
import { ActivityBlock } from './ActivityBlock.js';

import { Data } from '@symbiotejs/symbiote';
import { NetworkError, UploadError, uploadFileGroup } from '@uploadcare/upload-client';
import { calculateMaxCenteredCropFrame } from '../blocks/CloudImageEditor/src/crop-utils.js';
import { parseCropPreset } from '../blocks/CloudImageEditor/src/lib/parseCropPreset.js';
import { EventType } from '../blocks/UploadCtxProvider/EventEmitter.js';
import { UploadSource } from '../blocks/utils/UploadSource.js';
import { serializeCsv } from '../blocks/utils/comma-separated.js';
import { debounce } from '../blocks/utils/debounce.js';
import { customUserAgent } from '../blocks/utils/userAgent.js';
import { buildCollectionFileError, buildOutputFileError } from '../utils/buildOutputError.js';
import { createCdnUrl, createCdnUrlModifiers } from '../utils/cdn-utils.js';
import { IMAGE_ACCEPT_LIST, fileIsImage, matchExtension, matchMimeType, mergeFileTypes } from '../utils/fileTypes.js';
import { prettyBytes } from '../utils/prettyBytes.js';
import { stringToArray } from '../utils/stringToArray.js';
import { warnOnce } from '../utils/warnOnce.js';
import { uploaderBlockCtx } from './CTX.js';
import { TypedCollection } from './TypedCollection.js';
import { buildOutputCollectionState } from './buildOutputCollectionState.js';
import { uploadEntrySchema } from './uploadEntrySchema.js';

export class UploaderBlock extends ActivityBlock {
  couldBeCtxOwner = false;
  isCtxOwner = false;

  init$ = uploaderBlockCtx(this);

  /** @private */
  __initialUploadMetadata = null;

  /**
   * @private
   * @type {((
   *   outputEntry: import('../types').OutputFileEntry,
   *   internalEntry?: import('./TypedData.js').TypedData,
   * ) => undefined | ReturnType<typeof import('../utils/buildOutputError.js').buildOutputFileError>)[]}
   */
  _fileValidators = [
    this._validateIsImage.bind(this),
    this._validateFileType.bind(this),
    this._validateMaxSizeLimit.bind(this),
    this._validateUploadError.bind(this),
  ];

  /**
   * @private
   * @type {((
   *   collection: TypedCollection,
   * ) =>
   *   | undefined
   *   | ReturnType<typeof import('../utils/buildOutputError.js').buildCollectionFileError>
   *   | ReturnType<typeof import('../utils/buildOutputError.js').buildCollectionFileError>[])[]}
   */
  _collectionValidators = [
    (collection) => {
      const total = collection.size;
      const multipleMin = this.cfg.multiple ? this.cfg.multipleMin : 0;
      const multipleMax = this.cfg.multiple ? this.cfg.multipleMax : 1;
      if (multipleMin && total < multipleMin) {
        const message = this.l10n('files-count-limit-error-too-few', {
          min: multipleMin,
          max: multipleMax,
          total,
        });
        return buildCollectionFileError({
          type: 'TOO_FEW_FILES',
          message,
          total,
          min: multipleMin,
          max: multipleMax,
        });
      }

      if (multipleMax && total > multipleMax) {
        const message = this.l10n('files-count-limit-error-too-many', {
          min: multipleMin,
          max: multipleMax,
          total,
        });
        return buildCollectionFileError({
          type: 'TOO_MANY_FILES',
          message,
          total,
          min: multipleMin,
          max: multipleMax,
        });
      }
    },
    (collection) => {
      if (collection.items().some((id) => collection.readProp(id, 'errors').length > 0)) {
        return buildCollectionFileError({
          type: 'SOME_FILES_HAS_ERRORS',
          message: this.l10n('some-files-were-not-uploaded'),
        });
      }
    },
  ];

  /**
   * This is Public JS API method. Could be called before block initialization, so we need to delay state interactions
   * until block init.
   *
   * TODO: If we add more public methods, it is better to use the single queue instead of tons of private fields per
   * each method. See https://github.com/uploadcare/blocks/pull/162/
   *
   * @deprecated Use `metadata` instance property on `lr-config` block instead.
   * @param {import('@uploadcare/upload-client').Metadata} metadata
   * @public
   */
  setUploadMetadata(metadata) {
    warnOnce(
      'setUploadMetadata is deprecated. Use `metadata` instance property on `lr-config` block instead. See migration guide: https://uploadcare.com/docs/file-uploader/migration-to-0.25.0/',
    );
    if (!this.connectedOnce) {
      // @ts-ignore TODO: fix this
      this.__initialUploadMetadata = metadata;
    } else {
      this.$['*uploadMetadata'] = metadata;
    }
  }

  get hasCtxOwner() {
    return this.hasBlockInCtx((block) => {
      if (block instanceof UploaderBlock) {
        return block.isCtxOwner && block.isConnected && block !== this;
      }
      return false;
    });
  }

  initCallback() {
    super.initCallback();

    if (!this.$['*uploadCollection']) {
      let uploadCollection = new TypedCollection({
        typedSchema: uploadEntrySchema,
        watchList: ['uploadProgress', 'fileInfo', 'errors', 'cdnUrl', 'isUploading'],
      });
      this.$['*uploadCollection'] = uploadCollection;
    }

    if (!this.hasCtxOwner && this.couldBeCtxOwner) {
      this.initCtxOwner();
    }
  }

  destroyCtxCallback() {
    this._unobserveCollectionProperties?.();
    this._unobserveCollection?.();
    this.uploadCollection.destroy();
    this.$['*uploadCollection'] = null;

    super.destroyCtxCallback();
  }

  initCtxOwner() {
    this.isCtxOwner = true;

    /** @private */
    this._unobserveCollection = this.uploadCollection.observeCollection(this._handleCollectionUpdate);

    /** @private */
    this._unobserveCollectionProperties = this.uploadCollection.observeProperties(
      this._handleCollectionPropertiesUpdate,
    );

    this.subConfigValue('maxLocalFileSizeBytes', () => this._debouncedRunFileValidators());
    this.subConfigValue('multipleMin', () => this._debouncedRunFileValidators());
    this.subConfigValue('multipleMax', () => this._debouncedRunFileValidators());
    this.subConfigValue('multiple', () => this._debouncedRunFileValidators());
    this.subConfigValue('imgOnly', () => this._debouncedRunFileValidators());
    this.subConfigValue('accept', () => this._debouncedRunFileValidators());
    this.subConfigValue('maxConcurrentRequests', (value) => {
      this.$['*uploadQueue'].concurrency = Number(value) || 1;
    });

    if (this.__initialUploadMetadata) {
      this.$['*uploadMetadata'] = this.__initialUploadMetadata;
    }
  }

  // TODO: Probably we should not allow user to override `source` property

  /**
   * @param {string} url
   * @param {{ silent?: boolean; fileName?: string; source?: string }} [options]
   */
  addFileFromUrl(url, { silent, fileName, source } = {}) {
    this.uploadCollection.add({
      externalUrl: url,
      fileName: fileName ?? null,
      silentUpload: silent ?? false,
      source: source ?? UploadSource.API,
    });
  }

  /**
   * @param {string} uuid
   * @param {{ silent?: boolean; fileName?: string; source?: string }} [options]
   */
  addFileFromUuid(uuid, { silent, fileName, source } = {}) {
    this.uploadCollection.add({
      uuid,
      fileName: fileName ?? null,
      silentUpload: silent ?? false,
      source: source ?? UploadSource.API,
    });
  }

  /**
   * @param {File} file
   * @param {{ silent?: boolean; fileName?: string; source?: string; fullPath?: string }} [options]
   */
  addFileFromObject(file, { silent, fileName, source, fullPath } = {}) {
    this.uploadCollection.add({
      file,
      isImage: fileIsImage(file),
      mimeType: file.type,
      fileName: fileName ?? file.name,
      fileSize: file.size,
      silentUpload: silent ?? false,
      source: source ?? UploadSource.API,
      fullPath: fullPath ?? null,
    });
  }

  /**
   * @deprecated Will be removed in the near future. Please use `addFileFromObject`, `addFileFromUrl` or
   *   `addFileFromUuid` instead.
   * @param {File[]} files
   */
  addFiles(files) {
    console.warn(
      '`addFiles` method is deprecated. Please use `addFileFromObject`, `addFileFromUrl` or `addFileFromUuid` instead.',
    );
    files.forEach((/** @type {File} */ file) => {
      this.uploadCollection.add({
        file,
        isImage: fileIsImage(file),
        mimeType: file.type,
        fileName: file.name,
        fileSize: file.size,
      });
    });
  }

  uploadAll() {
    this.$['*uploadTrigger'] = {};

    const couldUploadAnything = !!this.uploadCollection.items().find((id) => {
      const entry = this.uploadCollection.read(id);
      return !entry.getValue('isUploading') && !entry.getValue('fileInfo');
    });

    if (couldUploadAnything) {
      this.emit(
        EventType.COMMON_UPLOAD_START,
        /** @type {import('../types').OutputCollectionState<'uploading'>} */ (this.getOutputCollectionState()),
      );
    }
  }

  /** @param {{ captureCamera?: boolean }} options */
  openSystemDialog(options = {}) {
    let accept = serializeCsv(mergeFileTypes([this.cfg.accept ?? '', ...(this.cfg.imgOnly ? IMAGE_ACCEPT_LIST : [])]));

    if (this.cfg.accept && !!this.cfg.imgOnly) {
      console.warn(
        'There could be a mistake.\n' +
          'Both `accept` and `imgOnly` parameters are set.\n' +
          'The value of `accept` will be concatenated with the internal image mime types list.',
      );
    }
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = this.cfg.multiple;
    if (options.captureCamera) {
      this.fileInput.capture = '';
      this.fileInput.accept = serializeCsv(IMAGE_ACCEPT_LIST);
    } else {
      this.fileInput.accept = accept;
    }
    this.fileInput.dispatchEvent(new MouseEvent('click'));
    this.fileInput.onchange = () => {
      // @ts-ignore TODO: fix this
      [...this.fileInput['files']].forEach((file) => this.addFileFromObject(file, { source: UploadSource.LOCAL }));
      // To call uploadTrigger UploadList should draw file items first:
      this.$['*currentActivity'] = ActivityBlock.activities.UPLOAD_LIST;
      this.setOrAddState('*modalActive', true);
      // @ts-ignore TODO: fix this
      this.fileInput['value'] = '';
      this.fileInput = null;
    };
  }

  /** @type {string[]} */
  get sourceList() {
    /** @type {string[]} */
    let list = [];
    if (this.cfg.sourceList) {
      list = stringToArray(this.cfg.sourceList);
    }
    // @ts-ignore TODO: fix this
    return list;
  }

  /** @param {Boolean} [force] */
  initFlow(force = false) {
    if (this.uploadCollection.size > 0 && !force) {
      this.set$({
        '*currentActivity': ActivityBlock.activities.UPLOAD_LIST,
      });
      this.setOrAddState('*modalActive', true);
    } else {
      if (this.sourceList?.length === 1) {
        let srcKey = this.sourceList[0];
        // Single source case:
        if (srcKey === 'local') {
          this.$['*currentActivity'] = ActivityBlock.activities.UPLOAD_LIST;
          this?.['openSystemDialog']();
        } else {
          if (Object.values(UploaderBlock.extSrcList).includes(/** @type {any} */ (srcKey))) {
            this.set$({
              '*currentActivityParams': {
                externalSourceType: srcKey,
              },
              '*currentActivity': ActivityBlock.activities.EXTERNAL,
            });
          } else {
            this.$['*currentActivity'] = srcKey;
          }
          this.setOrAddState('*modalActive', true);
        }
      } else {
        // Multiple sources case:
        this.set$({
          '*currentActivity': ActivityBlock.activities.START_FROM,
        });
        this.setOrAddState('*modalActive', true);
      }
    }
  }

  doneFlow() {
    this.set$({
      '*currentActivity': this.doneActivity,
      '*history': this.doneActivity ? [this.doneActivity] : [],
    });
    if (!this.$['*currentActivity']) {
      this.setOrAddState('*modalActive', false);
    }
  }

  /** @returns {TypedCollection} */
  get uploadCollection() {
    return this.$['*uploadCollection'];
  }

  /**
   * @private
   * @param {import('../types').OutputFileEntry} outputEntry
   */
  _validateFileType(outputEntry) {
    const imagesOnly = this.cfg.imgOnly;
    const accept = this.cfg.accept;
    const allowedFileTypes = mergeFileTypes([...(imagesOnly ? IMAGE_ACCEPT_LIST : []), accept]);
    if (!allowedFileTypes.length) return;

    const mimeType = outputEntry.mimeType;
    const fileName = outputEntry.name;

    if (!mimeType || !fileName) {
      // Skip client validation if mime type or file name are not available for some reasons
      return;
    }

    const mimeOk = matchMimeType(mimeType, allowedFileTypes);
    const extOk = matchExtension(fileName, allowedFileTypes);

    if (!mimeOk && !extOk) {
      // Assume file type is not allowed if both mime and ext checks fail
      return buildOutputFileError({
        type: 'FORBIDDEN_FILE_TYPE',
        message: this.l10n('file-type-not-allowed'),
        entry: outputEntry,
      });
    }
  }

  /**
   * @private
   * @param {import('../types').OutputFileEntry} outputEntry
   */
  _validateMaxSizeLimit(outputEntry) {
    const maxFileSize = this.cfg.maxLocalFileSizeBytes;
    const fileSize = outputEntry.size;
    if (maxFileSize && fileSize && fileSize > maxFileSize) {
      return buildOutputFileError({
        type: 'FILE_SIZE_EXCEEDED',
        message: this.l10n('files-max-size-limit-error', { maxFileSize: prettyBytes(maxFileSize) }),
        entry: outputEntry,
      });
    }
  }

  /**
   * @private
   * @param {import('../types').OutputFileEntry} outputEntry
   * @param {import('./TypedData.js').TypedData} [internalEntry]
   */
  _validateUploadError(outputEntry, internalEntry) {
    /** @type {unknown} */
    const cause = internalEntry?.getValue('uploadError');
    if (!cause) {
      return;
    }

    if (cause instanceof UploadError) {
      return buildOutputFileError({
        type: 'UPLOAD_ERROR',
        message: cause.message,
        entry: outputEntry,
        error: cause,
      });
    } else if (cause instanceof NetworkError) {
      return buildOutputFileError({
        type: 'NETWORK_ERROR',
        message: cause.message,
        entry: outputEntry,
        error: cause,
      });
    } else {
      const error = cause instanceof Error ? cause : new Error('Unknown error', { cause });
      return buildOutputFileError({
        type: 'UNKNOWN_ERROR',
        message: error.message,
        entry: outputEntry,
        error,
      });
    }
  }

  /**
   * @private
   * @param {import('../types').OutputFileEntry} outputEntry
   */
  _validateIsImage(outputEntry) {
    const imagesOnly = this.cfg.imgOnly;
    const isImage = outputEntry.isImage;
    if (!imagesOnly || isImage) {
      return;
    }
    if (!outputEntry.fileInfo && outputEntry.externalUrl) {
      // skip validation for not uploaded files with external url, cause we don't know if they're images or not
      return;
    }
    if (!outputEntry.fileInfo && !outputEntry.mimeType) {
      // skip validation for not uploaded files without mime-type, cause we don't know if they're images or not
      return;
    }
    return buildOutputFileError({
      type: 'NOT_AN_IMAGE',
      message: this.l10n('images-only-accepted'),
      entry: outputEntry,
    });
  }

  /**
   * @private
   * @param {import('./TypedData.js').TypedData} entry
   */
  _runFileValidatorsForEntry(entry) {
    const outputEntry = this.getOutputItem(entry.uid);
    const errors = [];

    for (const validator of this._fileValidators) {
      const error = validator(outputEntry, entry);
      if (error) {
        errors.push(error);
      }
    }
    entry.setValue('errors', errors);
  }

  /** @private */
  _debouncedRunFileValidators = debounce(this._runFileValidators.bind(this), 100);

  /**
   * @private
   * @param {string[]} [entryIds]
   */
  _runFileValidators(entryIds) {
    const ids = entryIds ?? this.uploadCollection.items();
    for (const id of ids) {
      const entry = this.uploadCollection.read(id);
      this._runFileValidatorsForEntry(entry);
    }
  }

  /** @private */
  _runCollectionValidators() {
    const collection = this.uploadCollection;
    const errors = [];

    for (const validator of this._collectionValidators) {
      const errorOrErrors = validator(collection);
      if (!errorOrErrors) {
        continue;
      }
      if (Array.isArray(errorOrErrors)) {
        errors.push(...errorOrErrors);
      } else {
        errors.push(errorOrErrors);
      }
    }

    this.$['*collectionErrors'] = errors;
  }

  /**
   * @private
   * @param {import('../types').OutputCollectionState} collectionState
   */
  async _createGroup(collectionState) {
    const uploadClientOptions = this.getUploadClientOptions();
    const uuidList = collectionState.allEntries.map((entry) => {
      return entry.uuid + (entry.cdnUrlModifiers ? `/${entry.cdnUrlModifiers}` : '');
    });
    const abortController = new AbortController();
    const resp = await uploadFileGroup(uuidList, { ...uploadClientOptions, signal: abortController.signal });
    if (this.$['*collectionState'] !== collectionState) {
      abortController.abort();
      return;
    }
    this.$['*groupInfo'] = resp;
    /** @type {ReturnType<typeof buildOutputCollectionState<'success', 'has-group'>>} */
    const collectionStateWithGroup = buildOutputCollectionState(this);
    this.emit(EventType.GROUP_CREATED, collectionStateWithGroup);
    this.emit(EventType.CHANGE, collectionStateWithGroup, { debounce: true });
    this.$['*collectionState'] = collectionStateWithGroup;
  }

  /** @private */
  _flushOutputItems = debounce(async () => {
    const data = this.getOutputData();
    if (data.length !== this.uploadCollection.size) {
      return;
    }
    const collectionState = buildOutputCollectionState(this);
    this.$['*collectionState'] = collectionState;
    this.emit(EventType.CHANGE, collectionState, { debounce: true });

    if (this.cfg.groupOutput && collectionState.status === 'success') {
      this._createGroup(collectionState);
    }
  }, 300);

  /**
   * @private
   * @type {Parameters<import('./TypedCollection.js').TypedCollection['observeCollection']>[0]}
   * @param {Set<import('./TypedData.js').TypedData>} removed
   */
  _handleCollectionUpdate = (entries, added, removed) => {
    if (added.size || removed.size) {
      this.$['*groupInfo'] = null;
    }
    this._runFileValidators();
    this._runCollectionValidators();

    for (const entry of added) {
      this.emit(EventType.FILE_ADDED, this.getOutputItem(entry.uid));
    }

    for (const entry of removed) {
      this.emit(EventType.FILE_REMOVED, this.getOutputItem(entry.uid, { isRemoved: true }));
      entry?.getValue('abortController')?.abort();
      entry?.setValue('abortController', null);
      URL.revokeObjectURL(entry?.getValue('thumbUrl'));
    }
    this.$['*uploadList'] = entries.map((uid) => {
      return { uid };
    });
    this._flushOutputItems();
  };

  /**
   * @private
   * @param {Record<keyof import('./uploadEntrySchema.js').UploadEntry, Set<string>>} changeMap
   */
  _handleCollectionPropertiesUpdate = (changeMap) => {
    this._flushOutputItems();

    const uploadCollection = this.uploadCollection;
    const updatedEntryIds = [
      ...new Set(
        Object.entries(changeMap)
          .filter(([key]) => key !== 'errors')
          .map(([, ids]) => [...ids])
          .flat(),
      ),
    ];

    this._debouncedRunFileValidators(updatedEntryIds);

    if (changeMap.isUploading) {
      for (const entryId of changeMap.isUploading) {
        const { isUploading } = Data.getCtx(entryId).store;
        if (isUploading) {
          this.emit(EventType.FILE_UPLOAD_START, this.getOutputItem(entryId));
        }
      }
    }
    if (changeMap.fileInfo) {
      for (const entryId of changeMap.fileInfo) {
        const { fileInfo } = Data.getCtx(entryId).store;
        if (fileInfo) {
          this.emit(EventType.FILE_UPLOAD_SUCCESS, this.getOutputItem(entryId));
        }
      }
      if (this.cfg.cropPreset) {
        this.setInitialCrop();
      }
      let loadedItems = uploadCollection.findItems((entry) => {
        return !!entry.getValue('fileInfo');
      });
      let errorItems = uploadCollection.findItems((entry) => {
        return entry.getValue('errors').length > 0;
      });
      if (errorItems.length === 0 && uploadCollection.size === loadedItems.length) {
        this.emit(
          EventType.COMMON_UPLOAD_SUCCESS,
          /** @type {import('../types').OutputCollectionState<'success'>} */ (this.getOutputCollectionState()),
        );
      }
    }
    if (changeMap.errors) {
      for (const entryId of changeMap.errors) {
        const { errors } = Data.getCtx(entryId).store;
        if (errors.length > 0) {
          this.emit(EventType.FILE_UPLOAD_FAILED, this.getOutputItem(entryId));
        }
      }
      let errorItems = uploadCollection.findItems((entry) => {
        return entry.getValue('errors').length > 0;
      });
      if (errorItems.length > 0) {
        this.emit(
          EventType.COMMON_UPLOAD_FAILED,
          /** @type {import('../types').OutputCollectionState<'failed'>} */ (this.getOutputCollectionState()),
        );
      }
    }
    if (changeMap.cdnUrl) {
      const uids = [...changeMap.cdnUrl].filter((uid) => {
        return !!this.uploadCollection.read(uid)?.getValue('cdnUrl');
      });
      uids.forEach((uid) => {
        this.emit(EventType.FILE_URL_CHANGED, this.getOutputItem(uid));
      });

      this.$['*groupInfo'] = null;
    }
    if (changeMap.uploadProgress) {
      for (const entryId of changeMap.uploadProgress) {
        const { isUploading } = Data.getCtx(entryId).store;
        if (isUploading) {
          this.emit(EventType.FILE_UPLOAD_PROGRESS, this.getOutputItem(entryId));
        }
      }
      let commonProgress = 0;
      /** @type {String[]} */
      let items = uploadCollection.findItems((entry) => {
        return entry.getValue('isUploading') && entry.getValue('errors').length === 0;
      });
      if (items.length === 0) {
        return;
      }
      items.forEach((id) => {
        commonProgress += uploadCollection.readProp(id, 'uploadProgress');
      });
      let progress = Math.round(commonProgress / items.length);
      this.$['*commonProgress'] = progress;
      this.emit(
        EventType.COMMON_UPLOAD_PROGRESS,
        /** @type {import('../types').OutputCollectionState<'uploading'>} */ (this.getOutputCollectionState()),
      );
    }
  };

  /** @private */
  setInitialCrop() {
    const cropPreset = parseCropPreset(this.cfg.cropPreset);
    if (cropPreset) {
      const [aspectRatioPreset] = cropPreset;

      const entries = this.uploadCollection
        .findItems(
          (entry) =>
            entry.getValue('fileInfo') &&
            entry.getValue('isImage') &&
            !entry.getValue('cdnUrlModifiers')?.includes('/crop/'),
        )
        .map((id) => this.uploadCollection.read(id));

      for (const entry of entries) {
        const fileInfo = entry.getValue('fileInfo');
        const { width, height } = fileInfo.imageInfo;
        const expectedAspectRatio = aspectRatioPreset.width / aspectRatioPreset.height;
        const crop = calculateMaxCenteredCropFrame(width, height, expectedAspectRatio);
        const cdnUrlModifiers = createCdnUrlModifiers(
          `crop/${crop.width}x${crop.height}/${crop.x},${crop.y}`,
          'preview',
        );
        entry.setMultipleValues({
          cdnUrlModifiers,
          cdnUrl: createCdnUrl(entry.getValue('cdnUrl'), cdnUrlModifiers),
        });
        if (
          this.uploadCollection.size === 1 &&
          this.cfg.useCloudImageEditor &&
          this.hasBlockInCtx((block) => block.activityType === ActivityBlock.activities.CLOUD_IMG_EDIT)
        ) {
          this.$['*focusedEntry'] = entry;
          this.$['*currentActivity'] = ActivityBlock.activities.CLOUD_IMG_EDIT;
        }
      }
    }
  }

  /**
   * @param {string} entryId
   * @protected
   */
  async getMetadataFor(entryId) {
    const configValue = this.cfg.metadata ?? /** @type {import('../types').Metadata} */ (this.$['*uploadMetadata']);
    if (typeof configValue === 'function') {
      const outputFileEntry = this.getOutputItem(entryId);
      const metadata = await configValue(outputFileEntry);
      return metadata;
    }
    return configValue;
  }

  /** @returns {import('@uploadcare/upload-client').FileFromOptions} */
  getUploadClientOptions() {
    let options = {
      store: this.cfg.store,
      publicKey: this.cfg.pubkey,
      baseCDN: this.cfg.cdnCname,
      baseURL: this.cfg.baseUrl,
      userAgent: customUserAgent,
      integration: this.cfg.userAgentIntegration,
      secureSignature: this.cfg.secureSignature,
      secureExpire: this.cfg.secureExpire,
      retryThrottledRequestMaxTimes: this.cfg.retryThrottledRequestMaxTimes,
      multipartMinFileSize: this.cfg.multipartMinFileSize,
      multipartChunkSize: this.cfg.multipartChunkSize,
      maxConcurrentRequests: this.cfg.multipartMaxConcurrentRequests,
      multipartMaxAttempts: this.cfg.multipartMaxAttempts,
      checkForUrlDuplicates: !!this.cfg.checkForUrlDuplicates,
      saveUrlForRecurrentUploads: !!this.cfg.saveUrlForRecurrentUploads,
    };

    return options;
  }

  /**
   * @template {import('../types').OutputFileStatus} TStatus
   * @param {string} entryId
   * @param {{ isRemoved?: boolean }} [options]
   * @returns {import('../types/exported.js').OutputFileEntry<TStatus>}
   */
  getOutputItem(entryId, { isRemoved = false } = {}) {
    const uploadEntryData = /** @type {import('./uploadEntrySchema.js').UploadEntry} */ (Data.getCtx(entryId).store);

    /** @type {import('@uploadcare/upload-client').UploadcareFile?} */
    const fileInfo = uploadEntryData.fileInfo;

    /** @type {import('../types').OutputFileEntry['status']} */
    let status = isRemoved
      ? 'removed'
      : uploadEntryData.errors.length > 0
        ? 'failed'
        : !!uploadEntryData.uuid
          ? 'success'
          : uploadEntryData.isUploading
            ? 'uploading'
            : 'idle';

    /** @type {unknown} */
    const outputItem = {
      uuid: fileInfo?.uuid ?? null,
      internalId: entryId,
      name: fileInfo?.originalFilename ?? uploadEntryData.fileName,
      size: fileInfo?.size ?? uploadEntryData.fileSize,
      isImage: fileInfo?.isImage ?? uploadEntryData.isImage,
      mimeType: fileInfo?.mimeType ?? uploadEntryData.mimeType,
      file: uploadEntryData.file,
      externalUrl: uploadEntryData.externalUrl,
      cdnUrlModifiers: uploadEntryData.cdnUrlModifiers,
      cdnUrl: uploadEntryData.cdnUrl ?? fileInfo?.cdnUrl ?? null,
      fullPath: uploadEntryData.fullPath,
      uploadProgress: uploadEntryData.uploadProgress,
      fileInfo: fileInfo ?? null,
      metadata: uploadEntryData.metadata ?? fileInfo?.metadata ?? null,
      isSuccess: status === 'success',
      isUploading: status === 'uploading',
      isFailed: status === 'failed',
      isRemoved: status === 'removed',
      errors: /** @type {import('../types/exported.js').OutputFileEntry['errors']} */ (uploadEntryData.errors),
      status,
    };

    return /** @type {import('../types/exported.js').OutputFileEntry<TStatus>} */ (outputItem);
  }

  /**
   * @param {(item: import('./TypedData.js').TypedData) => Boolean} [checkFn]
   * @returns {import('../types/exported.js').OutputFileEntry[]}
   */
  getOutputData(checkFn) {
    const entriesIds = checkFn ? this.uploadCollection.findItems(checkFn) : this.uploadCollection.items();
    const data = entriesIds.map((itemId) => this.getOutputItem(itemId));
    return data;
  }

  /** @template {import('../types').OutputCollectionStatus} TStatus */
  getOutputCollectionState() {
    return /** @type {ReturnType<buildOutputCollectionState<TStatus>>} */ (buildOutputCollectionState(this));
  }
}

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

/** @enum {String} */
UploaderBlock.sourceTypes = Object.freeze({
  LOCAL: 'local',
  URL: 'url',
  CAMERA: 'camera',
  DRAW: 'draw',
  ...UploaderBlock.extSrcList,
});
