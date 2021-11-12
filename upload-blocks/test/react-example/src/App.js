import '@uploadcare/upload-blocks/build/uc-basic.css';
import '@uploadcare/upload-blocks';
import style from './App.module.css';

function App() {
  return (
    <div className={style.ucConfig}>
      <uc-simple-btn class="uc-wgt-common"></uc-simple-btn>

      <uc-modal class="uc-wgt-common" strokes>
        <uc-activity-wrapper activity="source-select">
          <uc-source-list wrap></uc-source-list>
          <uc-drop-area></uc-drop-area>
        </uc-activity-wrapper>
        <uc-upload-list></uc-upload-list>
        <uc-camera-source></uc-camera-source>
        <uc-url-source></uc-url-source>
        <uc-external-source></uc-external-source>
        <uc-upload-details></uc-upload-details>
        <uc-confirmation-dialog></uc-confirmation-dialog>
        <uc-cloud-image-editor></uc-cloud-image-editor>
      </uc-modal>

      <uc-message-box class="uc-wgt-common"></uc-message-box>
      <uc-progress-bar class="uc-wgt-common"></uc-progress-bar>

      <uc-data-output
        fire-event
        from="*outputData"
        item-template="<img height='200' src='https://ucarecdn.com/{{uuid}}/' />"
        class="uc-wgt-common"
      ></uc-data-output>
    </div>
  );
}

export default App;
