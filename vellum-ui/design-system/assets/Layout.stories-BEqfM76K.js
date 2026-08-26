import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,n}from"./storyHelpers-SrU9jVcn.js";function r(e){return Math.max(40,e-60)}function i({startSize:e,delta:t,min:n,max:i,snapClosedAt:a}){let o=a??r(n),s=e+t;return s<o?{collapsed:!0,size:null}:{collapsed:!1,size:Math.round(Math.min(i,Math.max(n,s)))}}function a(e,{axis:t=`x`,grow:n=1,min:a,max:o,snapClosedAt:s=r(a),getSize:c,isCollapsed:l=()=>!1,setCollapsed:u=()=>{},applySize:d,commitSize:f=()=>{},resizingClass:p=``,ignoreFrom:m=`button, a, input, select`,keyboardStep:h=16,documentObj:g=globalThis.document}={}){if(!e||typeof c!=`function`||typeof d!=`function`)return()=>{};let _=null,v=t=>{t!=null&&e.setAttribute?.(`aria-valuenow`,String(t))};e.setAttribute?.(`aria-valuemin`,String(a)),e.setAttribute?.(`aria-valuemax`,String(o)),v(l()?a:Math.round(c()||a));let y=e=>t===`y`?e.clientY:e.clientX,b=e=>{if(e.collapsed){_.collapsed||(_.collapsed=!0,u(!0),v(a));return}_.collapsed&&(_.collapsed=!1,u(!1)),_.lastSize=e.size,d(e.size),v(e.size)},x=t=>{if(t.button!==void 0&&t.button!==0||m&&t.target?.closest?.(m))return;let n=!!l();_={pointerId:t.pointerId,startPos:y(t),startSize:n?0:c(),wasCollapsed:n,collapsed:n,moved:!1,lastSize:null};try{e.setPointerCapture?.(t.pointerId)}catch{}t.preventDefault?.(),p&&g?.body?.classList?.add(p)},S=e=>{if(!_||e.pointerId!==_.pointerId)return;let t=y(e)-_.startPos;!_.moved&&Math.abs(t)<3||(_.moved=!0,b(i({startSize:_.startSize,delta:t*n,min:a,max:o,snapClosedAt:s})))},C=(e,t)=>{if(!_||e.pointerId!==_.pointerId)return;p&&g?.body?.classList?.remove(p);let n=_;if(_=null,t){if(!n.moved){n.wasCollapsed&&u(!1);return}!n.collapsed&&n.lastSize!=null&&f(n.lastSize)}},w=e=>C(e,!0),T=e=>C(e,!1),E=e=>{let r=t===`y`?`ArrowDown`:`ArrowRight`,i=t===`y`?`ArrowUp`:`ArrowLeft`,s=e=>Math.round(Math.min(o,Math.max(a,e))),p=e=>{d(e),f(e),v(e)};if(e.key===`Enter`||e.key===` `){u(!l()),e.preventDefault?.();return}if(!l()){if(e.key===r||e.key===i){let t=e.key===r?1:-1;p(s(c()+t*n*h))}else if(e.key===`Home`)p(a);else if(e.key===`End`)p(o);else return;e.preventDefault?.()}};return e.addEventListener(`pointerdown`,x),e.addEventListener(`pointermove`,S),e.addEventListener(`pointerup`,w),e.addEventListener(`pointercancel`,T),e.addEventListener(`keydown`,E),()=>{e.removeEventListener(`pointerdown`,x),e.removeEventListener(`pointermove`,S),e.removeEventListener(`pointerup`,w),e.removeEventListener(`pointercancel`,T),e.removeEventListener(`keydown`,E)}}function o(){return n(`<nav class="breadcrumb" aria-label="breadcrumb">
    <a href="#collection">collection</a>
    <span class="breadcrumb-sep" aria-hidden="true">›</span>
    <a href="#fiction">fiction</a>
    <span class="breadcrumb-sep" aria-hidden="true">›</span>
    <span aria-current="page">Earthsea</span>
  </nav>`)}function s(){return n(`<div class="accordion" style="width: min(420px, 100%)">
    <details class="accordion-item" open><summary>edition details</summary><div class="accordion-body">first edition · hardcover · very good</div></details>
    <details class="accordion-item"><summary>reading history</summary><div class="accordion-body">finished October 2025</div></details>
    <details class="accordion-item"><summary>notes</summary><div class="accordion-body">a slim book with a world inside it</div></details>
  </div>`)}function c(){let e=document.createElement(`div`);e.className=`vui-story-demo-frame`,e.style.cssText+=`display:flex;height:240px;padding:0;overflow:hidden;`;let n=t(`aside`,`filters`,`vui-story-card`);n.id=`resizable-filter-pane`,n.style.cssText=`border-width:0 1px 0 0;border-radius:0;width:180px;min-width:0;flex:none;`;let r=t(`main`,`collection results`);r.style.cssText=`align-items:center;display:flex;flex:1;justify-content:center;`;let i=document.createElement(`div`);i.className=`vui-resize-divider vui-resize-divider-x`,i.tabIndex=0,i.setAttribute(`role`,`separator`),i.setAttribute(`aria-label`,`resize filters`),i.setAttribute(`aria-controls`,n.id),i.setAttribute(`aria-orientation`,`vertical`),i.append(t(`span`,``,`vui-resize-grip vui-resize-grip-x`));let o=!1;return u=a(i,{axis:`x`,min:120,max:320,getSize:()=>Number.parseFloat(n.style.width),isCollapsed:()=>o,setCollapsed:e=>{o=e,n.hidden=e},applySize:e=>{n.style.width=`${e}px`}}),e.append(n,i,r),e}var l,u,d,f,p,m,h;function g(){return(g=e((()=>{({expect:l}=__STORYBOOK_MODULE_TEST__),u=null,d={title:`Patterns/Layout`,tags:[`autodocs`],async beforeEach(){return()=>{u?.(),u=null}}},f={render:o},p={render:s},m={name:`Edge resize`,render:c,play:async({canvas:e,userEvent:t})=>{let n=e.getByRole(`separator`,{name:`resize filters`});n.focus(),await t.keyboard(`{ArrowRight}`),await l(n).toHaveAttribute(`aria-valuenow`,`196`),await t.keyboard(`{End}`),await l(n).toHaveAttribute(`aria-valuenow`,`320`)}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: renderBreadcrumb
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: renderAccordion
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  name: 'Edge resize',
  render: renderEdgeResize,
  play: async ({
    canvas,
    userEvent
  }) => {
    const separator = canvas.getByRole('separator', {
      name: 'resize filters'
    });
    separator.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(separator).toHaveAttribute('aria-valuenow', '196');
    await userEvent.keyboard('{End}');
    await expect(separator).toHaveAttribute('aria-valuenow', '320');
  }
}`,...m.parameters?.docs?.source}}},h=[`Breadcrumb`,`Accordion`,`EdgeResize`]})))()}g();export{p as Accordion,f as Breadcrumb,m as EdgeResize,h as __namedExportsOrder,d as default};