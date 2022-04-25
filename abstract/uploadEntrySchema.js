import { UploadcareFile, UploadClientError } from '../submodules/upload-client/upload-client.js';

/** @enum {{ type; value; nullable?: Boolean }} */
export const uploadEntrySchema = Object.freeze({
  file: {
    type: File,
    value: null,
  },
  externalUrl: {
    type: String,
    value: null,
  },
  fileName: {
    type: String,
    value: null,
  },
  fileSize: {
    type: Number,
    value: null,
  },
  lastModified: {
    type: Number,
    value: Date.now(),
  },
  uploadProgress: {
    type: Number,
    value: 0,
  },
  uuid: {
    type: String,
    value: null,
  },
  isImage: {
    type: Boolean,
    value: false,
  },
  mimeType: {
    type: String,
    value: null,
  },
  uploadError: {
    type: UploadClientError,
    value: null,
    nullable: true,
  },
  validationErrorMsg: {
    type: String,
    value: null,
    nullable: true,
  },
  ctxName: {
    type: String,
    value: null,
  },
  transformationsUrl: {
    type: String,
    value: null,
  },
  fileInfo: {
    type: UploadcareFile,
    value: null,
  },
  isUploading: {
    type: Boolean,
    value: false,
  },
});
