export const CSS = /*css*/ `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300&display=swap');

:root {
  --clr-bg: rgb(31, 29, 29);
  --clr-font: rgb(224, 253, 255);
  --clr-link: rgb(253, 255, 139);
  --clr-panel: rgba(255, 255, 255, .1);
  --clr-accent: rgb(233, 159, 255);
  --clr-accent-shade: rgba(233, 159, 255, .06);
  --clr-code: #fff;
  --clr-code-hl: rgb(255, 112, 112);

  --gap-min: 2px;
  --gap-mid: 10px;
  --gap-max: 20px;
  --gap-huge: 60px;
}

html, body {
  padding: 0;
  margin: 0;
  background-color: var(--clr-bg);
  color: var(--clr-font);
  font-family: 'Roboto', sans-serif;
}

body {
  transition: .6s;
}

uc-live-html {
  min-height: 400px;
}

a {
  color: var(--clr-link);
}

code {
  display: block;
  background-color: #000;
  color: var(--clr-code);
  padding: var(--gap-max);
  overflow-x: auto;
}

code .hl {
  color: var(--clr-code-hl);
}

code:not([class]) {
  display: inline-block;
  padding: var(--gap-min);
  padding-left: .5em;
  padding-right: .5em;
}

blockquote {
  display: block;
  color: var(--clr-accent);
  background-color: var(--clr-accent-shade);
  padding: var(--gap-mid);
  margin: 0;
  margin-top: var(--gap-max);
  border-left: var(--gap-min) solid currentColor;
}

h1 {
  color: var(--clr-accent);
}

h2 {
  margin-top: calc(var(--gap-max) * 3);
}

li {
  margin-bottom: var(--gap-mid);
}
`;

/** @param {() => void} cb */
export function initStyles(cb) {
  let blob = new Blob([CSS], {
    type: 'text/css',
  });
  let url = URL.createObjectURL(blob);
  let link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.onload = () => {
    cb();
  };
  document.head.appendChild(link);
}
