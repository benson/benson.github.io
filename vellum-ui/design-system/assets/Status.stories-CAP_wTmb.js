import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,i as n,n as r,r as i}from"./storyHelpers-SrU9jVcn.js";import{n as a,r as o,t as s}from"./motion-D_OjNL95.js";import{i as c,n as l,r as u,t as d}from"./statusState-BILxUSko.js";function f(e){let t=e.querySelector(`.toast-stack`);return t||(t=e.createElement(`div`),t.className=`toast-stack`,e.body.append(t)),t}function p(e,t={}){let{tone:n=`neutral`,duration:r=4e3,dismissLabel:i=`dismiss`,documentRef:o=globalThis.document,motion:c=`auto`,reason:l=`manual`,event:u=null}=t;if(!o?.createElement)return null;let d=f(o),p=o.createElement(`div`);p.className=`toast toast-${String(n||`neutral`).trim()}`,p.setAttribute(`role`,n===`danger`?`alert`:`status`),s(p,{motion:c,reason:l,event:u}),a(p,!0);let h=o.createElement(`span`);h.className=`toast-message`,h.textContent=String(e??``),p.append(h);let g=null,_=!1,v=!1,y=0,b=Math.max(0,Number(r)||0),x=new Set,S=o.defaultView||globalThis,C=S.setTimeout?.bind(S)||globalThis.setTimeout,w=S.clearTimeout?.bind(S)||globalThis.clearTimeout,T=({debit:e=!1}={})=>{g!=null&&(w(g),g=null,e&&(b=Math.max(0,b-(Date.now()-y))))},E=()=>{v||(v=!0,T(),p.removeEventListener(`pointerenter`,j),p.removeEventListener(`pointerleave`,M),p.removeEventListener(`focusin`,N),p.removeEventListener(`focusout`,P),o.removeEventListener?.(`visibilitychange`,F),p.remove(),d.childElementCount||d.remove())},D=({reason:e=`manual`,event:t=null,motion:n=c}={})=>{if(_)return;_=!0,T(),s(p,{motion:n,reason:e,event:t}),a(p,!1),p.classList.add(`is-leaving`);let r=e=>{e.target===p&&(p.removeEventListener(`transitionend`,r),E())};p.addEventListener(`transitionend`,r),C(E,m(p,S))},O=()=>{_||b<=0||x.size||(y=Date.now(),g=C(()=>D({reason:`timeout`}),b))},k=(e=`manual`)=>{x.add(e),T({debit:!0})},A=(e=`manual`)=>{x.delete(e),O()};function j(){k(`pointer`)}function M(){A(`pointer`)}function N(){k(`focus`)}function P(e){p.contains?.(e.relatedTarget)||A(`focus`)}function F(){o.hidden?k(`document`):A(`document`)}let I=o.createElement(`button`);return I.className=`icon-btn toast-dismiss`,I.type=`button`,I.setAttribute(`aria-label`,i),I.textContent=`×`,I.addEventListener(`click`,e=>D({reason:`dismiss`,event:e})),p.append(I),p.addEventListener(`pointerenter`,j),p.addEventListener(`pointerleave`,M),p.addEventListener(`focusin`,N),p.addEventListener(`focusout`,P),o.addEventListener?.(`visibilitychange`,F),d.append(p),o.hidden&&x.add(`document`),O(),{el:p,dismiss:D,pause:k,resume:A}}function m(e,t){let n=t.getComputedStyle?.(e);return h(n)}function h(e={}){let t=g(e?.transitionDuration),n=g(e?.transitionDelay),r=t.reduce((e,t,r)=>Math.max(e,t+(n[r%Math.max(n.length,1)]||0)),0);return Math.max(_,r+50)}function g(e=``){return String(e).split(`,`).map(e=>e.trim()).map(e=>{let t=Number.parseFloat(e);return Number.isFinite(t)?e.endsWith(`ms`)?t:t*1e3:0})}var _;function v(){return(v=e((()=>{o(),_=260})))()}function y(){let e=i();for(let[t,n]of[[`neutral`,`idle`],[`success`,`synced`],[`warn`,`needs review`],[`danger`,`failed`]]){let r=document.createElement(`span`);l(r,{label:n,tone:t}),e.append(r)}return e}function b(){let e=n();for(let t of[{kind:`loading`,message:`syncing your library…`},{kind:`empty`,message:`nothing on this shelf yet`},{kind:`inline-error`,message:`that ISBN does not look right`},{kind:`retryable-error`,message:`sync failed`,detail:`the server did not respond`,retryAction:`sync`},{kind:`blocking-error`,message:`library unavailable`,detail:`try again after reconnecting`}]){let n=document.createElement(`div`);l(n,t),e.append(n)}let t=e.querySelector(`[data-status-action="sync"]`);return t?.addEventListener(`click`,()=>{let e=t.parentElement.parentElement;l(e,{kind:`loading`,message:`trying again…`})}),e}function x(){let e=i(),n=t(`span`,`✨`,`ui-chip-emoji`);return n.setAttribute(`aria-hidden`,`true`),e.append(u({text:`fiction`}),u({text:`favorite`,prefixNode:n}),u({text:`borrowed`,variant:`quiet`}),u({text:`hardcover`,remove:{enabled:!0,label:`remove hardcover filter`}})),e.querySelector(`.ui-chip-remove`)?.addEventListener(`click`,e=>e.currentTarget.parentElement.remove()),e}function S(){let e=r(`<aside class="banner" aria-label="site update">
    <span class="banner-message">the catalog has been updated</span>
    <div class="banner-actions"><button class="btn" type="button">reload</button></div>
    <button class="icon-btn banner-dismiss" type="button" aria-label="dismiss update">×</button>
  </aside>`);return e.querySelector(`.banner-dismiss`).addEventListener(`click`,()=>e.remove()),e}function C(){let e=n(),r=t(`button`,`save book`,`btn`);return r.type=`button`,r.addEventListener(`click`,t=>{E?.dismiss({motion:`none`}),E=p(`book saved to your library`,{documentRef:e.ownerDocument,duration:3e4,event:t,reason:`trigger`,tone:`success`})}),e.append(r,t(`p`,`Toasts pause while hovered or focused and dismiss themselves.`,`vui-story-note`)),e}function w(){return r(`<div class="vui-story-row">
    <span class="badge">3</span>
    <span class="badge badge-quiet">12</span>
    <span class="badge badge-accent">99+</span>
    <button class="btn btn-secondary" type="button">loans <span class="badge badge-quiet">4</span></button>
  </div>`)}var T,E,D,O,k,A,j,M,N,P;function F(){return(F=e((()=>{c(),d(),v(),{expect:T}=__STORYBOOK_MODULE_TEST__,E=null,D={title:`Components/Status & feedback`,tags:[`autodocs`],async beforeEach(){return()=>{E?.dismiss({motion:`none`}),E=null,document.querySelectorAll(`.toast-stack`).forEach(e=>e.remove())}}},O={render:y},k={render:b,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`retry`})),await T(e.getByText(`trying again…`)).toBeVisible()}},A={render:x,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`remove hardcover filter`})),await T(e.queryByText(`hardcover`)).not.toBeInTheDocument()}},j={render:S,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`dismiss update`})),await T(e.queryByLabelText(`site update`)).not.toBeInTheDocument()}},M={render:C,play:async({canvas:e,canvasElement:t,userEvent:n})=>{await n.click(e.getByRole(`button`,{name:`save book`}));let r=t.ownerDocument.querySelector(`[role="status"].toast`);await T(r).toHaveTextContent(`book saved to your library`)}},N={render:w},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  render: renderTones
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  render: renderStates,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'retry'
    }));
    await expect(canvas.getByText('trying again…')).toBeVisible();
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  render: renderChips,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'remove hardcover filter'
    }));
    await expect(canvas.queryByText('hardcover')).not.toBeInTheDocument();
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  render: renderBanner,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'dismiss update'
    }));
    await expect(canvas.queryByLabelText('site update')).not.toBeInTheDocument();
  }
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  render: renderToast,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole('button', {
      name: 'save book'
    }));
    const notification = canvasElement.ownerDocument.querySelector('[role="status"].toast');
    await expect(notification).toHaveTextContent('book saved to your library');
  }
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  render: renderBadges
}`,...N.parameters?.docs?.source}}},P=[`Tones`,`ApplicationStates`,`Chips`,`Banner`,`Toast`,`Badges`]})))()}F();export{k as ApplicationStates,N as Badges,j as Banner,A as Chips,M as Toast,O as Tones,P as __namedExportsOrder,D as default};