import { createCdnUrl, createCdnUrlModifiers } from '../../../utils/cdn-utils.js';
import { transformationsToOperations } from './lib/transformationUtils.js';
import { TRANSPARENT_PIXEL_SRC } from '../../../utils/transparentPixelSrc.js';

/** @param {import('./CloudEditor.js').CloudEditor} fnCtx */
export function initState(fnCtx) {
  return {
    '*originalUrl': null,
    '*faderEl': null,
    '*cropperEl': null,
    '*imgEl': null,
    '*imgContainerEl': null,
    '*networkProblems': false,
    '*imageSize': null,
    /** @type {import('./types.js').Transformations} */
    '*editorTransformations': {},

    entry: null,
    extension: null,
    editorMode: false,
    modalCaption: '',
    isImage: false,
    msg: '',
    src: TRANSPARENT_PIXEL_SRC,
    fileType: '',
    showLoader: false,
    uuid: null,
    cdnUrl: null,

    'presence.networkProblems': false,
    'presence.modalCaption': true,
    'presence.editorToolbar': false,
    'presence.viewerToolbar': true,
    // TODO: beware of wrong ctx in case of element re-creation:
    '*on.retryNetwork': () => {
      let images = fnCtx.querySelectorAll('img');
      for (let img of images) {
        let originalSrc = img.src;
        img.src = TRANSPARENT_PIXEL_SRC;
        img.src = originalSrc;
      }
      fnCtx.$['*networkProblems'] = false;
    },
    '*on.apply': (transformations) => {
      if (!transformations) {
        return;
      }
      let originalUrl = fnCtx.$['*originalUrl'];
      let cdnUrlModifiers = createCdnUrlModifiers(transformationsToOperations(transformations));
      let cdnUrl = createCdnUrl(originalUrl, createCdnUrlModifiers(cdnUrlModifiers, 'preview'));

      /** @type {import('./types.js').ApplyResult} */
      let eventData = {
        originalUrl,
        cdnUrlModifiers,
        cdnUrl,
        transformations,
      };
      fnCtx.dispatchEvent(
        new CustomEvent('apply', {
          detail: eventData,
          bubbles: true,
          composed: true,
        })
      );
      fnCtx.remove();
    },
    '*on.cancel': () => {
      fnCtx.remove();

      fnCtx.dispatchEvent(
        new CustomEvent('cancel', {
          bubbles: true,
          composed: true,
        })
      );
    },
  };
}
