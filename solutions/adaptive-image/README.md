# Adaptive Image

Universal web component for the efficient image representation on any page. It generates a set of URLs for the initial image source with the desired parameters.

## 💎 Solution benefits

- No need to initiate something or to scan a document: the browser takes care of it.
- Uniform integration for most of the modern stacks.
- Modern standards support: `srcset`, native lazy loading, breakpoints, etc.
- Creates adaptive background images if needed.
- You need HTML and CSS only to set it up.

<re-htm src="./demo.htm"></re-htm>

## Quick start

Connect script:

```html
<script src="https://unpkg.com/@uploadcare/blocks@{{PACKAGE_VERSION}}/web/lr-img.min.js" type="module"></script>
```

Add basic settings:

```css
lr-img {
  --lr-img-pubkey: 'YOUR_PROJECT_PUBLIC_KEY';
  --lr-img-breakpoints: '200, 500, 800';
}
```

A public key is necessary if your images aren't yet uploaded to the Uploadcare. Get the public key in [Uploadcare project's dashboard](https://app.uploadcare.com/projects/-/api-keys/).

Then use `<lr-img>` tag for the images in your HTML templates:

```html
<lr-img src="SOURCE_IMAGE_PATH"></lr-img>
```

## Workflow

1. Web component initiats and reads its settings, including the source image path.
2. Component uses [Uploadcare Proxy](https://uploadcare.com/docs/delivery/proxy/) to upload the source image if that hasn't been done before.
3. Image component generates all necessary src sets for the resulting image and renders the `img` tag into the DOM.

## Fallback

For the SEO or NOSCRIPT purposes, use `<noscript>` sections in your integrations with the original image path:

```html
<lr-img src="SOURCE_IMAGE_PATH">
  <noscript>
    <img src="SOURCE_IMAGE_PATH" />
  </noscript>
</lr-img>
```

After initiating, if JavaScript is enabled in the browser, that will be transformed into:

```html
<lr-img src="SOURCE_IMAGE_PATH">
  <img srcset="...GENERATED_SRC_LIST" />
</lr-img>
```

## Lazy loading

[Native lazy loading](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-loading) is enabled by default for all image components. You can disable it or use a custom one based on [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).

Disable lazy loading:

```html
<style>
  lr-img {
    --lr-img-lazy: 0;
  }
</style>

<lr-img src="SOURCE_IMAGE_PATH"></lr-img>
```

Enabled intersection observer:

```html
<style>
  lr-img {
    --lr-img-intersection: 1;
  }
</style>

<lr-img src="SOURCE_IMAGE_PATH"></lr-img>
```

## Breakpoints

If you have a responsive layout where images could be resized in some cases, it's good to set a list of breakpoints to avoid exceeding sizes generation via Uploadcare CDN operations:

```html
<style>
  @import url('./test.css');

  lr-img {
    --lr-img-breakpoints: '400, 800, 1200';
  }
</style>

<lr-img src="SOURCE_IMAGE_PATH"></lr-img>
```

That will save the resources and make image behavior more expected. The browser will select the most suitable image size automatically.

## Layout shift

It's good to set up the initial size for the images to avoid layout shifting during loading.

## CDN operations

You can provide transformation settings for the single image or the set of images:

```html
<style>
  .invert {
    --lr-img-cdn-operations: 'invert';
  }
</style>

<lr-img class="invert" src="SOURCE_IMAGE_PATH"></lr-img>
```

Operations description syntax is the same as used in [URL API](https://uploadcare.com/docs/transformations/image/). More examples:

```html
<style>
  .invert_grayscale {
    --lr-img-cdn-operations: 'invert/-/grayscale';
  }
  .old_styled {
    --lr-img-cdn-operations: 'saturation/-80/-/contrast/80/-/warmth/50';
  }
</style>
```

As you can see, transformation definitions are separated with `/-/` symbols, just like you can use in the [URL API](https://uploadcare.com/docs/transformations/image/).

## Background mode

To use an adaptive image as an element's background, you can use `is-background-for` attribute with the desired element's CSS selector in its value:

```html
<style>
  #target {
    background-size: cover;
  }
</style>

<div id="target">Some text...</div>

<lr-img is-background-for="#target" src="SOURCE_IMAGE_PATH"></lr-img>
```

## Development mode (relative image path)

When you develop an application, you can use a local development server and relative paths in your project structure for the images. In that case, Uploadcare Proxy would be disabled for your development environment, and you will see original local images in your application until you deploy it:

```html
<lr-img src="../LOCAL_IMAGE_PATH"></lr-img>
```

## UUID

If you already have UUIDs for images uploaded to Uploadcare, you can use them in image component directly:

```html
<lr-img uuid="CDN_UUID"></lr-img>
```

In this case, you don't need the `pubkey` setting to upload the source image for further processing.

## Settings

CSS context properties are available for any container's nested element, just like any other CSS property. HTML attribute settings have more priority and can redefine other settings.

| CSS context property       | HTML Attribute    | Default value | Type        |
| :------------------------- | :---------------- | :------------ | :---------- |
| --lr-img-dev-mode          | dev-mode          | none          | number flag |
| --lr-img-pubkey            | pubkey            | none          | string      |
| --lr-img-uuid              | uuid              | none          | string      |
| --lr-img-src               | src               | none          | string      |
| --lr-img-lazy              | lazy              | `1`           | number flag |
| --lr-img-intersection      | intersection      | `0`           | number flag |
| --lr-img-breakpoints       | breakpoints       | none          | string      |
| --lr-img-cdn-cname         | cdn-cname         | none          | string      |
| --lr-img-proxy-cname       | proxy-cname       | none          | string      |
| --lr-img-hi-res-support    | hi-res-support    | `1`           | number flag |
| --lr-img-ultra-res-support | ultra-res-support | `0`           | number flag |
| --lr-img-format            | format            | `'webp'`      | string      |
| --lr-img-cdn-operations    | cdn-operations    | none          | string      |
| --lr-img-progressive       | progressive       | none          | number flag |
| --lr-img-quality           | quality           | `'smart'`     | string      |
| --lr-img-is-background-for | is-background-for | none          | string      |
