import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{r as t,t as n}from"./controlPrimitives-Cg8obPNg.js";import{a as r,i,n as a,r as o}from"./storyHelpers-BDeT8eX0.js";function s({disabled:e,label:t,onClick:a,shortcut:o,variant:s}){let c=document.createElement(`template`);c.innerHTML=n({label:t,variant:s,attrs:e?{disabled:!0}:{}});let l=c.content.firstElementChild;if(o){let e=document.createElement(`span`);e.className=`btn-shortcut`,e.textContent=o,l.append(e)}let u=r(`p`,`No button activated.`,`vui-story-note`);return u.setAttribute(`role`,`status`),l.addEventListener(`click`,e=>{a(e),u.textContent=`Activated ${t}.`}),i(l,u)}function c(e,t=`Choose an enabled specimen.`){let n=r(`p`,t,`vui-story-note`);return n.setAttribute(`role`,`status`),e.addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t||t.disabled)return;let r=t.closest(`tr`)?.querySelector(`th`)?.textContent?.trim();n.textContent=`Activated ${r?`${r} `:``}${t.textContent.trim()}.`}),e.append(n),e}function l({disabled:e=!1,label:t,shortcut:i=``,variant:o=`primary`}){let s=a(n({label:t,variant:o,attrs:e?{disabled:!0}:{}}));if(i){let e=r(`span`,i,`btn-shortcut`);e.setAttribute(`aria-hidden`,`true`),s.append(e)}return s}function u(){let e=document.createElement(`table`);e.className=`vui-component-matrix`,e.innerHTML=`<thead><tr><th scope="col">variant</th><th scope="col">default</th><th scope="col">shortcut</th><th scope="col">disabled</th></tr></thead>`;let t=document.createElement(`tbody`);for(let e of[`primary`,`secondary`,`danger`,`ink`]){let n=document.createElement(`tr`);n.append(r(`th`,e)),n.firstElementChild.setAttribute(`scope`,`row`);for(let t of[l({label:`continue`,variant:e}),l({label:`continue`,shortcut:`↵`,variant:e}),l({disabled:!0,label:`continue`,variant:e})]){let e=document.createElement(`td`);e.append(t),n.append(e)}t.append(n)}e.append(t);let n=document.createElement(`section`);n.className=`vui-component-lab-section`,n.append(r(`h3`,`Variant × state matrix`),r(`p`,`Compare weight, contrast, geometry, and disabled treatment without changing context.`,`vui-story-note`),e);let i=document.createElement(`div`);return i.className=`vui-component-lab`,i.append(n),c(i)}function d(){let e=document.createElement(`section`);e.className=`vui-component-lab-section`,e.append(r(`h3`,`Content stress`));for(let[t,n]of[[`short`,l({label:`save`})],[`typical`,l({label:`add to collection`})],[`long`,l({label:`add all selected books to the reading queue`})],[`shortcut`,l({label:`open quick search`,shortcut:`⌘ K`,variant:`ink`})]]){let i=document.createElement(`div`);i.className=`vui-component-stress-row`,i.append(r(`code`,t),n),e.append(i)}let t=i(r(`span`,`240px container`,`vui-story-label`),l({label:`save changes to this collection`}));t.style.width=`240px`,e.append(t);let n=document.createElement(`div`);return n.className=`vui-component-lab`,n.append(e),c(n)}function f(){let e=document.createElement(`section`);return e.className=`vui-component-lab-section`,e.append(r(`h3`,`Keyboard path`),r(`p`,`Tab through the real controls to judge focus visibility and ordering.`,`vui-story-note`),o(l({label:`previous`,variant:`secondary`}),l({label:`save draft`}),l({label:`delete draft`,variant:`danger`}))),c(e,`Use Tab to inspect the keyboard path.`)}var p,m,h,g,_,v,y,b,x,S,C,w;function T(){return(T=e((()=>{t(),{expect:p,fn:m}=__STORYBOOK_MODULE_TEST__,h={title:`Components/Button`,tags:[`autodocs`],render:s,argTypes:{variant:{control:`select`,options:[`primary`,`secondary`,`danger`,`ink`]},label:{control:`text`},shortcut:{control:`text`},disabled:{control:`boolean`}},args:{disabled:!1,label:`add to shelf`,onClick:m(),shortcut:``,variant:`primary`}},g={play:async({args:e,canvas:t,canvasElement:n,userEvent:r})=>{await r.click(t.getByRole(`button`,{name:`add to shelf`})),await p(e.onClick).toHaveBeenCalledOnce(),await p(t.getByRole(`status`)).toHaveTextContent(`Activated add to shelf`),n.replaceChildren(s(e))}},_={args:{label:`cancel`,variant:`secondary`}},v={args:{label:`remove book`,variant:`danger`}},y={args:{label:`search`,shortcut:`/`,variant:`ink`}},b={args:{disabled:!0,label:`saving…`}},x={name:`Deep dive: variant matrix`,parameters:{controls:{disable:!0}},render:u,play:async({canvas:e,canvasElement:t,parameters:n,userEvent:r})=>{await p(n.controls.disable).toBe(!0),await r.click(e.getAllByRole(`button`,{name:`continue`})[0]),await p(e.getByRole(`status`)).toHaveTextContent(`Activated primary continue`),t.replaceChildren(u())}},S={name:`Deep dive: content stress`,parameters:{controls:{disable:!0}},render:d,play:async({canvas:e,canvasElement:t,parameters:n,userEvent:r})=>{await p(n.controls.disable).toBe(!0),await r.click(e.getByRole(`button`,{name:`save`,exact:!0})),await p(e.getByRole(`status`)).toHaveTextContent(`Activated save`),t.replaceChildren(d())}},C={name:`Deep dive: keyboard path`,parameters:{controls:{disable:!0}},render:f,play:async({canvas:e,canvasElement:t,parameters:n,userEvent:r})=>{await p(n.controls.disable).toBe(!0),await r.tab(),await p(e.getByRole(`button`,{name:`previous`})).toHaveFocus(),await r.tab(),await p(e.getByRole(`button`,{name:`save draft`})).toHaveFocus(),await r.click(e.getByRole(`button`,{name:`save draft`})),await p(e.getByRole(`status`)).toHaveTextContent(`Activated save draft`),t.replaceChildren(f())}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvas,
    canvasElement,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("button", {
      name: "add to shelf"
    }));
    await expect(args.onClick).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("status")).toHaveTextContent("Activated add to shelf");
    canvasElement.replaceChildren(renderButton(args));
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    label: "cancel",
    variant: "secondary"
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    label: "remove book",
    variant: "danger"
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    label: "search",
    shortcut: "/",
    variant: "ink"
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true,
    label: "saving…"
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  name: "Deep dive: variant matrix",
  parameters: {
    controls: {
      disable: true
    }
  },
  render: renderVariantMatrix,
  play: async ({
    canvas,
    canvasElement,
    parameters,
    userEvent
  }) => {
    await expect(parameters.controls.disable).toBe(true);
    await userEvent.click(canvas.getAllByRole("button", {
      name: "continue"
    })[0]);
    await expect(canvas.getByRole("status")).toHaveTextContent("Activated primary continue");
    canvasElement.replaceChildren(renderVariantMatrix());
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  name: "Deep dive: content stress",
  parameters: {
    controls: {
      disable: true
    }
  },
  render: renderContentStress,
  play: async ({
    canvas,
    canvasElement,
    parameters,
    userEvent
  }) => {
    await expect(parameters.controls.disable).toBe(true);
    await userEvent.click(canvas.getByRole("button", {
      name: "save",
      exact: true
    }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Activated save");
    canvasElement.replaceChildren(renderContentStress());
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  name: "Deep dive: keyboard path",
  parameters: {
    controls: {
      disable: true
    }
  },
  render: renderKeyboardPath,
  play: async ({
    canvas,
    canvasElement,
    parameters,
    userEvent
  }) => {
    await expect(parameters.controls.disable).toBe(true);
    await userEvent.tab();
    await expect(canvas.getByRole("button", {
      name: "previous"
    })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", {
      name: "save draft"
    })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", {
      name: "save draft"
    }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Activated save draft");
    canvasElement.replaceChildren(renderKeyboardPath());
  }
}`,...C.parameters?.docs?.source}}},w=[`Primary`,`Secondary`,`Danger`,`WithShortcut`,`Disabled`,`VariantMatrix`,`ContentStress`,`KeyboardPath`]})))()}T();export{S as ContentStress,v as Danger,b as Disabled,C as KeyboardPath,g as Primary,_ as Secondary,x as VariantMatrix,y as WithShortcut,w as __namedExportsOrder,h as default};