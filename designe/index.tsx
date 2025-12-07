import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './src/index.css';

const originalDefine = customElements.define;
customElements.define = function (name, constructor, options) {
  if (customElements.get(name)) {
    console.warn(`Custom element ${name} has already been defined.`);
    return;
  }
  originalDefine.call(customElements, name, constructor, options);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);