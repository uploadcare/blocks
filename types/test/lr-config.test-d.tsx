import React from 'react';
import { expectType } from 'tsd';
import '../jsx.js';
import { OutputFileEntry } from '../index.js';

// @ts-expect-error untyped props
() => <lr-config ctx="1" something="wrong"></lr-config>;

// @ts-expect-error missing ctx
() => <lr-config></lr-config>;

// allow common html attributes and required ctx
() => <lr-config ctx="1" id="1" class="1" hidden></lr-config>;

// allow key prop
() => <lr-config ctx="1" key={1}></lr-config>;

// allow useRef hook
() => {
  const ref = React.useRef<InstanceType<Config> | null>(null);
  expectType<InstanceType<Config> | null>(ref.current);
  <lr-config ctx="1" ref={ref}></lr-config>;
};

// allow callback ref
() => {
  <lr-config
    ctx="1"
    ref={(el) => {
      expectType<InstanceType<Config> | null>(el);
    }}
  ></lr-config>;
};

// allow createRef
() => {
  const ref = React.createRef<InstanceType<Config>>();
  expectType<InstanceType<Config> | null>(ref.current);
  <lr-config ctx="1" ref={ref}></lr-config>;
};

// accept config attributes
() => <lr-config ctx="1" multiple multipleMax={1} multipleMin={2} accept="str" />;

// allow to use DOM properties
() => {
  const ref = React.useRef<InstanceType<Config> | null>(null);
  if (ref.current) {
    const config = ref.current;
    config.metadata = { foo: 'bar' };
    config.secureSignature = '1231';
    config.multiple = true;
  }
};

// allow to pass metadata
() => {
  const ref = React.useRef<InstanceType<Config> | null>(null);
  if (ref.current) {
    const config = ref.current;
    config.metadata = { foo: 'bar' };
    config.metadata = () => ({ foo: 'bar' });
    config.metadata = async (entry) => {
      expectType<OutputFileEntry>(entry);
      return { foo: 'bar' };
    };
  }
};
