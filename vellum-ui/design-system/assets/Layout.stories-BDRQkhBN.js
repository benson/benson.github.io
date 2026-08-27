import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,i as n,n as r,o as i}from"./storyHelpers-BDeT8eX0.js";function a(e){return Math.max(40,e-60)}function o({startSize:e,delta:t,min:n,max:r,snapClosedAt:i}){let o=i??a(n),s=e+t;return s<o?{collapsed:!0,size:null}:{collapsed:!1,size:Math.round(Math.min(r,Math.max(n,s)))}}function s(e,{axis:t=`x`,grow:n=1,min:r,max:i,snapClosedAt:s=a(r),getSize:c,isCollapsed:l=()=>!1,setCollapsed:u=()=>{},applySize:d,commitSize:f=()=>{},resizingClass:p=``,ignoreFrom:m=`button, a, input, select`,keyboardStep:h=16,documentObj:g=globalThis.document}={}){if(!e||typeof c!=`function`||typeof d!=`function`)return()=>{};let _=null,v=t=>{t!=null&&e.setAttribute?.(`aria-valuenow`,String(t))};e.setAttribute?.(`aria-valuemin`,String(r)),e.setAttribute?.(`aria-valuemax`,String(i)),v(l()?r:Math.round(c()||r));let y=e=>t===`y`?e.clientY:e.clientX,b=e=>{if(e.collapsed){_.collapsed||(_.collapsed=!0,u(!0),v(r));return}_.collapsed&&(_.collapsed=!1,u(!1)),_.lastSize=e.size,d(e.size),v(e.size)},x=t=>{if(t.button!==void 0&&t.button!==0||m&&t.target?.closest?.(m))return;let n=!!l();_={pointerId:t.pointerId,startPos:y(t),startSize:n?0:c(),wasCollapsed:n,collapsed:n,moved:!1,lastSize:null};try{e.setPointerCapture?.(t.pointerId)}catch{}t.preventDefault?.(),p&&g?.body?.classList?.add(p)},S=e=>{if(!_||e.pointerId!==_.pointerId)return;let t=y(e)-_.startPos;!_.moved&&Math.abs(t)<3||(_.moved=!0,b(o({startSize:_.startSize,delta:t*n,min:r,max:i,snapClosedAt:s})))},C=(e,t)=>{if(!_||e.pointerId!==_.pointerId)return;p&&g?.body?.classList?.remove(p);let n=_;if(_=null,t){if(!n.moved){n.wasCollapsed&&u(!1);return}!n.collapsed&&n.lastSize!=null&&f(n.lastSize)}},w=e=>C(e,!0),T=e=>C(e,!1),E=e=>{let a=t===`y`?`ArrowDown`:`ArrowRight`,o=t===`y`?`ArrowUp`:`ArrowLeft`,s=e=>Math.round(Math.min(i,Math.max(r,e))),p=e=>{d(e),f(e),v(e)};if(e.key===`Enter`||e.key===` `){u(!l()),e.preventDefault?.();return}if(!l()){if(e.key===a||e.key===o){let t=e.key===a?1:-1;p(s(c()+t*n*h))}else if(e.key===`Home`)p(r);else if(e.key===`End`)p(i);else return;e.preventDefault?.()}};return e.addEventListener(`pointerdown`,x),e.addEventListener(`pointermove`,S),e.addEventListener(`pointerup`,w),e.addEventListener(`pointercancel`,T),e.addEventListener(`keydown`,E),()=>{e.removeEventListener(`pointerdown`,x),e.removeEventListener(`pointermove`,S),e.removeEventListener(`pointerup`,w),e.removeEventListener(`pointercancel`,T),e.removeEventListener(`keydown`,E)}}function c(){let e=r(`<nav class="breadcrumb" aria-label="breadcrumb">
    <a href="#collection">collection</a>
    <span class="breadcrumb-sep" aria-hidden="true">›</span>
    <a href="#fiction">fiction</a>
    <span class="breadcrumb-sep" aria-hidden="true">›</span>
    <span aria-current="page">Earthsea</span>
  </nav>`),i=t(`p`,`Current page: Earthsea.`,`vui-story-note`);return i.setAttribute(`role`,`status`),e.addEventListener(`click`,e=>{let t=e.target.closest(`a`);t&&(e.preventDefault(),i.textContent=`Would navigate to ${t.textContent}.`)}),n(e,i)}function l(){return r(`<div class="accordion" style="width: min(420px, 100%)">
    <details class="accordion-item" open><summary>edition details</summary><div class="accordion-body">first edition · hardcover · very good</div></details>
    <details class="accordion-item"><summary>reading history</summary><div class="accordion-body">finished October 2025</div></details>
    <details class="accordion-item"><summary>notes</summary><div class="accordion-body">a slim book with a world inside it</div></details>
  </div>`)}function u(){let e=document.createElement(`div`);e.className=`vui-story-demo-frame`,e.style.cssText+=`display:flex;height:240px;padding:0;overflow:hidden;`;let n=t(`aside`,`filters`,`vui-story-card`);n.id=`resizable-filter-pane`,n.style.cssText=`border-width:0 1px 0 0;border-radius:0;width:180px;min-width:0;flex:none;`;let r=t(`main`,`collection results`);r.style.cssText=`align-items:center;display:flex;flex:1;justify-content:center;`;let a=document.createElement(`div`);a.className=`vui-resize-divider vui-resize-divider-x`,a.tabIndex=0,a.setAttribute(`role`,`separator`),a.setAttribute(`aria-label`,`resize filters`),a.setAttribute(`aria-controls`,n.id),a.setAttribute(`aria-orientation`,`vertical`),a.append(t(`span`,``,`vui-resize-grip vui-resize-grip-x`));let o=!1,c=s(a,{axis:`x`,min:120,max:320,getSize:()=>Number.parseFloat(n.style.width),isCollapsed:()=>o,setCollapsed:e=>{o=e,n.hidden=e},applySize:e=>{n.style.width=`${e}px`}});return e.append(n,a,r),i(e,c)}var d,f,p,m,h,g;function _(){return(_=e((()=>{({expect:d}=__STORYBOOK_MODULE_TEST__),f={title:`Patterns/Layout`,tags:[`autodocs`]},p={render:c,play:async({canvas:e,canvasElement:t,userEvent:n})=>{await n.click(e.getByRole(`link`,{name:`fiction`})),await d(e.getByRole(`status`)).toHaveTextContent(`Would navigate to fiction`),t.replaceChildren(c())}},m={render:l},h={name:`Edge resize`,render:u,play:async({canvas:e,canvasElement:t,userEvent:n})=>{let r=e.getByRole(`separator`,{name:`resize filters`});r.focus(),await n.keyboard(`{ArrowRight}`),await d(r).toHaveAttribute(`aria-valuenow`,`196`),await n.keyboard(`{End}`),await d(r).toHaveAttribute(`aria-valuenow`,`320`),t.replaceChildren(u())}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: renderBreadcrumb,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("link", {
      name: "fiction"
    }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Would navigate to fiction");
    canvasElement.replaceChildren(renderBreadcrumb());
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: renderAccordion
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  name: "Edge resize",
  render: renderEdgeResize,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    const separator = canvas.getByRole("separator", {
      name: "resize filters"
    });
    separator.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(separator).toHaveAttribute("aria-valuenow", "196");
    await userEvent.keyboard("{End}");
    await expect(separator).toHaveAttribute("aria-valuenow", "320");
    canvasElement.replaceChildren(renderEdgeResize());
  }
}`,...h.parameters?.docs?.source}}},g=[`Breadcrumb`,`Accordion`,`EdgeResize`]})))()}_();export{m as Accordion,p as Breadcrumb,h as EdgeResize,g as __namedExportsOrder,f as default};