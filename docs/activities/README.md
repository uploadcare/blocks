# Activities

**Activity** — is a current user interaction stage focused on the uploader application. It helps manage the visibility of components and switches between several UI states. To create an activity, you will need to register it in your custom block:

```javascript
import { LR } from '@uploadcare/blocks';

class MyBlock extends LR.BlockComponent {
  initCallback() {
    const onActivate = () => {
      console.log('activity-name is activated');
    };
    const onDeactivate = () => {
      console.log('activity-name is deactcivated');
    };
    this.registerActivity('my-activity-name', {
      onActivate,
      onDeactivate,
    });
  }
}
```

Then, if some other component will call the registered activity, it will be activated with `active` attribute, and the activation callback will be called.

JavaScript:

```javascript
import { LR } from '@uploadcare/blocks';

class MyOtherBlock extends LR.BlockComponent {
  onclick = () => {
    this.$['*currentActivity'] = 'my-activity-name';
  };
}
```

Resulting HTML:

```html
<lr-my-block activity="my-activity-name" active>...</lr-my-block>
```

Then you can use `lr-my-block[active]` selector to specify visibility or animations with CSS.

Here is the list of reserved pre-defined activities:

- `source-select`
- `camera`
- `upload-list`
- `url`
- `confirmation`
- `cloud-image-edit`
- `*external`
- `details`
