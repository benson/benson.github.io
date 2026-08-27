import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,i as n,n as r,r as i}from"./storyHelpers-BDeT8eX0.js";function a({page:e=1,pageCount:t=1,siblings:n=1}={}){let r=Math.max(1,Math.floor(t)||1),i=Math.min(Math.max(1,Math.floor(e)||1),r),a=Math.max(0,Math.floor(n)||0);if(r<=a*2+5)return o(1,r);let s=Math.max(2,Math.min(i-a,r-a*2-2)),c=Math.min(r-1,Math.max(i+a,a*2+3)),l=[1];return s>3?l.push(`gap`):l.push(...o(2,s-1)),l.push(...o(s,c)),c<r-2?l.push(`gap`):l.push(...o(c+1,r-1)),l.push(r),l}function o(e,t){let n=[];for(let r=e;r<=t;r+=1)n.push(r);return n}function s(e){if(e==null||e===``)return``;let t=Number(e);return Number.isFinite(t)?`$ ${t>100?String(Math.round(t)):t.toFixed(2)}`:``}function c({amount:e,text:t}){return t==null?s(e):String(t)}function l(e){let t=String(e),n=2166136261;for(let e=0;e<t.length;e++)n=Math.imul(n^t.charCodeAt(e),16777619);return n>>>0}function u(e){let t=e>>>0;return()=>{t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function d(e){if(!e)return null;let t=e===!0||typeof e==`string`||typeof e==`number`?{seed:e===!0?null:e}:e||{},n={x:t.x??p.x,y:t.y??p.y,rot:t.rot??p.rot},r=t.seed==null?Math.random:u(l(t.seed)),i=e=>Math.round(e*100)/100,a=e=>i((r()*2-1)*e);return{"--price-jitter-x":`${a(n.x)}px`,"--price-jitter-y":`${a(n.y)}px`,"--price-jitter-rot":`${a(n.rot)}deg`}}function f(e,t){if(e&&!e.createElement&&(t=e,e=globalThis.document),!e?.createElement)return null;let n=t||{},r=c(n);if(!r)return null;let i=e.createElement(`span`);i.className=`card-sleeve-price`;let a=d(n.jitter);if(a)for(let[e,t]of Object.entries(a))i.style.setProperty(e,t);let o=e.createElement(`span`);return o.textContent=r,i.append(o),i}var p;function m(){return(m=e((()=>{p={x:5,y:5,rot:5}})))()}function h(){return r(`<table class="vui-table">
    <caption>library inventory</caption>
    <thead><tr><th scope="col">book</th><th scope="col">author</th><th scope="col">format</th></tr></thead>
    <tbody>
      <tr><td>A Wizard of Earthsea</td><td>Ursula K. Le Guin</td><td>hardcover</td></tr>
      <tr><td>Piranesi</td><td>Susanna Clarke</td><td>paperback</td></tr>
      <tr><td>Kindred</td><td>Octavia E. Butler</td><td>hardcover</td></tr>
    </tbody>
  </table>`)}function g(){let e={page:7,pageCount:20},n=document.createElement(`nav`);n.className=`pager`,n.setAttribute(`aria-label`,`pagination`);let r=()=>{n.replaceChildren();let i=t(`button`,`‹`,`pager-btn`);i.type=`button`,i.setAttribute(`aria-label`,`previous page`),i.disabled=e.page<=1,i.addEventListener(`click`,()=>{--e.page,r()}),n.append(i);for(let i of a(e)){if(i===`gap`){let e=t(`span`,`…`,`pager-gap`);e.setAttribute(`aria-hidden`,`true`),n.append(e);continue}let a=t(`button`,String(i),`pager-btn`);a.type=`button`,a.setAttribute(`aria-label`,`page ${i}`),i===e.page&&a.setAttribute(`aria-current`,`page`),a.addEventListener(`click`,()=>{e.page=i,r()}),n.append(a)}let o=t(`button`,`›`,`pager-btn`);o.type=`button`,o.setAttribute(`aria-label`,`next page`),o.disabled=e.page>=e.pageCount,o.addEventListener(`click`,()=>{e.page+=1,r()}),n.append(o)};return r(),n}function _(e,n,r){let i=t(`div`,e,`card-sleeve-slot`),a=document.createElement(`div`);return a.className=`card-sleeve`,a.style.setProperty(`--card-sleeve-width`,`104px`),a.append(i,f({amount:n,jitter:r})),a}function v(){return i(_(`Earthsea`,4.2,`earthsea`),_(`Piranesi`,12,`piranesi`),_(`Kindred`,8.5,`kindred`))}function y(){let e=r(`<div class="vui-story-card">
    <span class="vui-story-note">loading book details…</span>
    <div aria-hidden="true">
      <div class="skeleton skeleton-line" style="width: 60%"></div>
      <div class="skeleton skeleton-line" style="width: 100%"></div>
      <div class="skeleton skeleton-line" style="width: 82%"></div>
    </div>
  </div>`),t=r(`<div class="empty-state"><span class="empty-state-glyph" aria-hidden="true">📚</span><span>no books match these filters</span></div>`);return i(e,t)}function b(){let e=n();for(let t of[8,62,100]){let n=r(`<div class="vui-story-field">
      <span class="vui-story-label">${t}% imported</span>
      <div class="progress" role="progressbar" aria-label="import progress" aria-valuenow="${t}" aria-valuemin="0" aria-valuemax="100" style="--progress: ${t}%"><span class="progress-fill"></span></div>
    </div>`);e.append(n)}return e}var x,S,C,w,T,E,D,O;function k(){return(k=e((()=>{m(),{expect:x}=__STORYBOOK_MODULE_TEST__,S={title:`Components/Data display`,tags:[`autodocs`]},C={render:h},w={render:g,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`next page`})),await x(e.getByRole(`button`,{name:`page 8`})).toHaveAttribute(`aria-current`,`page`)}},T={name:`Card sleeves & price stickers`,render:v},E={name:`Loading & empty`,render:y},D={render:b},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  render: renderTable
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: renderPagination,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'next page'
    }));
    await expect(canvas.getByRole('button', {
      name: 'page 8'
    })).toHaveAttribute('aria-current', 'page');
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  name: 'Card sleeves & price stickers',
  render: renderCardSleeves
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  name: 'Loading & empty',
  render: renderLoadingAndEmpty
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  render: renderProgress
}`,...D.parameters?.docs?.source}}},O=[`Table`,`Pagination`,`CardSleeves`,`LoadingAndEmpty`,`Progress`]})))()}k();export{T as CardSleeves,E as LoadingAndEmpty,w as Pagination,D as Progress,C as Table,O as __namedExportsOrder,S as default};