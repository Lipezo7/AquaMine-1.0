const React = (() => {
  let hooks = [];
  let hookIndex = 0;
  let rootComponent = null;
  let rootContainer = null;
  let cleanupEffects = [];
  let queued = false;

  function createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat().filter((child) => child !== false && child !== null && child !== undefined) };
  }

  function render(component, container) {
    rootComponent = component;
    rootContainer = container;
    rerender();
  }

  function scheduleRender() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      rerender();
    });
  }

  function rerender() {
    hookIndex = 0;
    rootContainer.innerHTML = "";
    rootContainer.appendChild(toDom(typeof rootComponent.type === "function" ? rootComponent.type(rootComponent.props) : rootComponent));
  }

  function toDom(vnode) {
    if (typeof vnode === "string" || typeof vnode === "number") return document.createTextNode(vnode);
    if (typeof vnode.type === "function") return toDom(vnode.type({ ...vnode.props, children: vnode.children }));
    const element = document.createElement(vnode.type);
    for (const [key, value] of Object.entries(vnode.props || {})) {
      if (key === "className") element.setAttribute("class", value);
      else if (key === "ref" && value) value.current = element;
      else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== false && value !== null && value !== undefined) element.setAttribute(key, value);
    }
    vnode.children.map(toDom).forEach((child) => element.appendChild(child));
    return element;
  }

  function useState(initial) {
    const current = hookIndex;
    hooks[current] = hooks[current] ?? (typeof initial === "function" ? initial() : initial);
    const setState = (value) => {
      hooks[current] = typeof value === "function" ? value(hooks[current]) : value;
      scheduleRender();
    };
    hookIndex += 1;
    return [hooks[current], setState];
  }

  function depsChanged(oldDeps, deps) {
    return !oldDeps || deps.length !== oldDeps.length || deps.some((dep, index) => dep !== oldDeps[index]);
  }

  function useEffect(effect, deps = []) {
    const current = hookIndex;
    if (depsChanged(hooks[current], deps)) {
      setTimeout(() => {
        cleanupEffects[current]?.();
        cleanupEffects[current] = effect();
      });
      hooks[current] = deps;
    }
    hookIndex += 1;
  }

  function useMemo(factory, deps = []) {
    const current = hookIndex;
    if (!hooks[current] || depsChanged(hooks[current].deps, deps)) hooks[current] = { deps, value: factory() };
    hookIndex += 1;
    return hooks[current].value;
  }

  function useRef(initial) {
    const current = hookIndex;
    hooks[current] = hooks[current] || { current: initial };
    hookIndex += 1;
    return hooks[current];
  }

  return { createElement, render, useState, useEffect, useMemo, useRef };
})();

window.React = React;
