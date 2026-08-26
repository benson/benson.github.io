import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{r as t,t as n}from"./controlPrimitives-Cg8obPNg.js";import{a as r,i,n as a,r as o}from"./storyHelpers-SrU9jVcn.js";function s({disabled:e,label:t,onClick:r,shortcut:i,variant:a}){let o=document.createElement(`template`);o.innerHTML=n({label:t,variant:a,attrs:e?{disabled:!0}:{}});let s=o.content.firstElementChild;if(i){let e=document.createElement(`span`);e.className=`btn-shortcut`,e.textContent=i,s.append(e)}return s.addEventListener(`click`,r),s}function c({disabled:e=!1,label:t,shortcut:i=``,variant:o=`primary`}){let s=a(n({label:t,variant:o,attrs:e?{disabled:!0}:{}}));if(i){let e=r(`span`,i,`btn-shortcut`);e.setAttribute(`aria-hidden`,`true`),s.append(e)}return s}function l(){let e=document.createElement(`table`);e.className=`vui-component-matrix`,e.innerHTML=`<thead><tr><th scope="col">variant</th><th scope="col">default</th><th scope="col">shortcut</th><th scope="col">disabled</th></tr></thead>`;let t=document.createElement(`tbody`);for(let e of[`primary`,`secondary`,`danger`,`ink`]){let n=document.createElement(`tr`);n.append(r(`th`,e)),n.firstElementChild.setAttribute(`scope`,`row`);for(let t of[c({label:`continue`,variant:e}),c({label:`continue`,shortcut:`↵`,variant:e}),c({disabled:!0,label:`continue`,variant:e})]){let e=document.createElement(`td`);e.append(t),n.append(e)}t.append(n)}e.append(t);let n=document.createElement(`section`);n.className=`vui-component-lab-section`,n.append(r(`h3`,`Variant × state matrix`),r(`p`,`Compare weight, contrast, geometry, and disabled treatment without changing context.`,`vui-story-note`),e);let i=document.createElement(`div`);return i.className=`vui-component-lab`,i.append(n),i}function u(){let e=document.createElement(`section`);e.className=`vui-component-lab-section`,e.append(r(`h3`,`Content stress`));for(let[t,n]of[[`short`,c({label:`save`})],[`typical`,c({label:`add to collection`})],[`long`,c({label:`add all selected books to the reading queue`})],[`shortcut`,c({label:`open quick search`,shortcut:`⌘ K`,variant:`ink`})]]){let i=document.createElement(`div`);i.className=`vui-component-stress-row`,i.append(r(`code`,t),n),e.append(i)}let t=i(r(`span`,`240px container`,`vui-story-label`),c({label:`save changes to this collection`}));t.style.width=`240px`,e.append(t);let n=document.createElement(`div`);return n.className=`vui-component-lab`,n.append(e),n}function d(){let e=document.createElement(`section`);return e.className=`vui-component-lab-section`,e.append(r(`h3`,`Keyboard path`),r(`p`,`Tab through the real controls to judge focus visibility and ordering.`,`vui-story-note`),o(c({label:`previous`,variant:`secondary`}),c({label:`save draft`}),c({label:`delete draft`,variant:`danger`}))),e}var f,p,m,h,g,_,v,y,b,x,S,C;function w(){return(w=e((()=>{t(),{expect:f,fn:p}=__STORYBOOK_MODULE_TEST__,m={title:`Components/Button`,tags:[`autodocs`],render:s,argTypes:{variant:{control:`select`,options:[`primary`,`secondary`,`danger`,`ink`]},label:{control:`text`},shortcut:{control:`text`},disabled:{control:`boolean`}},args:{disabled:!1,label:`add to shelf`,onClick:p(),shortcut:``,variant:`primary`}},h={play:async({args:e,canvas:t,userEvent:n})=>{await n.click(t.getByRole(`button`,{name:`add to shelf`})),await f(e.onClick).toHaveBeenCalledOnce()}},g={args:{label:`cancel`,variant:`secondary`}},_={args:{label:`remove book`,variant:`danger`}},v={args:{label:`search`,shortcut:`/`,variant:`ink`}},y={args:{disabled:!0,label:`saving…`}},b={name:`Deep dive: variant matrix`,render:l},x={name:`Deep dive: content stress`,render:u},S={name:`Deep dive: keyboard path`,render:d,play:async({canvas:e,userEvent:t})=>{await t.tab(),await f(e.getByRole(`button`,{name:`previous`})).toHaveFocus(),await t.tab(),await f(e.getByRole(`button`,{name:`save draft`})).toHaveFocus()}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'add to shelf'
    }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'cancel',
    variant: 'secondary'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'remove book',
    variant: 'danger'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'search',
    shortcut: '/',
    variant: 'ink'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true,
    label: 'saving…'
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  name: 'Deep dive: variant matrix',
  render: renderVariantMatrix
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  name: 'Deep dive: content stress',
  render: renderContentStress
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  name: 'Deep dive: keyboard path',
  render: renderKeyboardPath,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.tab();
    await expect(canvas.getByRole('button', {
      name: 'previous'
    })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('button', {
      name: 'save draft'
    })).toHaveFocus();
  }
}`,...S.parameters?.docs?.source}}},C=[`Primary`,`Secondary`,`Danger`,`WithShortcut`,`Disabled`,`VariantMatrix`,`ContentStress`,`KeyboardPath`]})))()}w();export{x as ContentStress,_ as Danger,y as Disabled,S as KeyboardPath,h as Primary,g as Secondary,b as VariantMatrix,v as WithShortcut,C as __namedExportsOrder,m as default};