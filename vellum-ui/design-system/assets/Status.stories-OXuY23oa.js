import{n as e}from"./rolldown-runtime-DkW27tQK.js";import{a as t,i as n,n as r,o as i,r as a}from"./storyHelpers-BDeT8eX0.js";import{n as o,r as s,t as c}from"./motion-D_OjNL95.js";import{i as l,n as u,r as d,t as f}from"./statusState-BILxUSko.js";function p(e){let t=e.querySelector(`.toast-stack`);return t||(t=e.createElement(`div`),t.className=`toast-stack`,e.body.append(t)),t}function m(e,t={}){let{tone:n=`neutral`,duration:r=4e3,dismissLabel:i=`dismiss`,documentRef:a=globalThis.document,motion:s=`auto`,reason:l=`manual`,event:u=null}=t;if(!a?.createElement)return null;let d=p(a),f=a.createElement(`div`);f.className=`toast toast-${String(n||`neutral`).trim()}`,f.setAttribute(`role`,n===`danger`?`alert`:`status`),c(f,{motion:s,reason:l,event:u}),o(f,!0);let m=a.createElement(`span`);m.className=`toast-message`,m.textContent=String(e??``),f.append(m);let g=null,_=!1,v=!1,y=0,b=Math.max(0,Number(r)||0),x=new Set,S=a.defaultView||globalThis,C=S.setTimeout?.bind(S)||globalThis.setTimeout,w=S.clearTimeout?.bind(S)||globalThis.clearTimeout,T=({debit:e=!1}={})=>{g!=null&&(w(g),g=null,e&&(b=Math.max(0,b-(Date.now()-y))))},E=()=>{v||(v=!0,T(),f.removeEventListener(`pointerenter`,j),f.removeEventListener(`pointerleave`,M),f.removeEventListener(`focusin`,N),f.removeEventListener(`focusout`,P),a.removeEventListener?.(`visibilitychange`,F),f.remove(),d.childElementCount||d.remove())},D=({reason:e=`manual`,event:t=null,motion:n=s}={})=>{if(_)return;_=!0,T(),c(f,{motion:n,reason:e,event:t}),o(f,!1),f.classList.add(`is-leaving`);let r=e=>{e.target===f&&(f.removeEventListener(`transitionend`,r),E())};f.addEventListener(`transitionend`,r),C(E,h(f,S))},O=()=>{_||b<=0||x.size||(y=Date.now(),g=C(()=>D({reason:`timeout`}),b))},k=(e=`manual`)=>{x.add(e),T({debit:!0})},A=(e=`manual`)=>{x.delete(e),O()};function j(){k(`pointer`)}function M(){A(`pointer`)}function N(){k(`focus`)}function P(e){f.contains?.(e.relatedTarget)||A(`focus`)}function F(){a.hidden?k(`document`):A(`document`)}let I=a.createElement(`button`);return I.className=`icon-btn toast-dismiss`,I.type=`button`,I.setAttribute(`aria-label`,i),I.textContent=`×`,I.addEventListener(`click`,e=>D({reason:`dismiss`,event:e})),f.append(I),f.addEventListener(`pointerenter`,j),f.addEventListener(`pointerleave`,M),f.addEventListener(`focusin`,N),f.addEventListener(`focusout`,P),a.addEventListener?.(`visibilitychange`,F),d.append(f),a.hidden&&x.add(`document`),O(),{el:f,dismiss:D,pause:k,resume:A}}function h(e,t){let n=t.getComputedStyle?.(e);return g(n)}function g(e={}){let t=_(e?.transitionDuration),n=_(e?.transitionDelay),r=t.reduce((e,t,r)=>Math.max(e,t+(n[r%Math.max(n.length,1)]||0)),0);return Math.max(v,r+50)}function _(e=``){return String(e).split(`,`).map(e=>e.trim()).map(e=>{let t=Number.parseFloat(e);return Number.isFinite(t)?e.endsWith(`ms`)?t:t*1e3:0})}var v;function y(){return(y=e((()=>{s(),v=260})))()}function b(){let e=a();for(let[t,n]of[[`neutral`,`idle`],[`success`,`synced`],[`warn`,`needs review`],[`danger`,`failed`]]){let r=document.createElement(`span`);u(r,{label:n,tone:t}),e.append(r)}return e}function x(){let e=document.createElement(`div`);e.className=`vui-component-lab`;let n=document.createElement(`section`);n.className=`vui-component-lab-section`,n.append(t(`h3`,`Application states`),t(`p`,`Compare hierarchy, recovery language, and action treatment across the complete state family.`,`vui-story-note`));for(let[e,r]of[[`loading`,{kind:`loading`,message:`syncing your library…`}],[`empty`,{kind:`empty`,message:`nothing on this shelf yet`}],[`inline error`,{kind:`inline-error`,message:`that ISBN does not look right`}],[`retryable`,{kind:`retryable-error`,message:`sync failed`,detail:`the server did not respond`,retryAction:`sync`}],[`blocking`,{kind:`blocking-error`,message:`library unavailable`,detail:`try again after reconnecting`}]]){let i=document.createElement(`div`);i.className=`vui-component-stress-row`;let a=document.createElement(`div`);u(a,r),i.append(t(`code`,e),a),n.append(i)}let r=n.querySelector(`[data-status-action="sync"]`);return r?.addEventListener(`click`,()=>{let e=r.parentElement.parentElement;u(e,{kind:`loading`,message:`trying again…`})}),e.append(n),e}function S(){let e=a(),n=t(`span`,`✨`,`ui-chip-emoji`);return n.setAttribute(`aria-hidden`,`true`),e.append(d({text:`fiction`}),d({text:`favorite`,prefixNode:n}),d({text:`borrowed`,variant:`quiet`}),d({text:`hardcover`,remove:{enabled:!0,label:`remove hardcover filter`}})),e.querySelector(`.ui-chip-remove`)?.addEventListener(`click`,e=>e.currentTarget.parentElement.remove()),e}function C(){let e=r(`<aside class="banner" aria-label="site update">
    <span class="banner-message">the catalog has been updated</span>
    <div class="banner-actions"><button class="btn" type="button">reload</button></div>
    <button class="icon-btn banner-dismiss" type="button" aria-label="dismiss update">×</button>
  </aside>`);return e.querySelector(`.banner-dismiss`).addEventListener(`click`,()=>e.remove()),e}function w(){let e=n(),r=t(`button`,`save book`,`btn`),a=null;return r.type=`button`,r.addEventListener(`click`,t=>{a?.dismiss({motion:`none`}),a=m(`book saved to your library`,{documentRef:e.ownerDocument,duration:3e4,event:t,reason:`trigger`,tone:`success`})}),e.append(r,t(`p`,`Toasts pause while hovered or focused and dismiss themselves.`,`vui-story-note`)),i(e,()=>a?.dismiss({motion:`none`}))}function T(){return r(`<div class="vui-story-row">
    <span class="badge">3</span>
    <span class="badge badge-quiet">12</span>
    <span class="badge badge-accent">99+</span>
    <button class="btn btn-secondary" type="button">loans <span class="badge badge-quiet">4</span></button>
  </div>`)}var E,D,O,k,A,j,M,N,P;function F(){return(F=e((()=>{l(),f(),y(),{expect:E}=__STORYBOOK_MODULE_TEST__,D={title:`Components/Status & feedback`,tags:[`autodocs`]},O={render:b},k={render:x,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`retry`})),await E(e.getByText(`trying again…`)).toBeVisible()}},A={render:S,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`remove hardcover filter`})),await E(e.queryByText(`hardcover`)).not.toBeInTheDocument()}},j={render:C,play:async({canvas:e,userEvent:t})=>{await t.click(e.getByRole(`button`,{name:`dismiss update`})),await E(e.queryByLabelText(`site update`)).not.toBeInTheDocument()}},M={render:w,play:async({canvas:e,canvasElement:t,userEvent:n})=>{await n.click(e.getByRole(`button`,{name:`save book`}));let r=t.ownerDocument.querySelector(`[role="status"].toast`);await E(r).toHaveTextContent(`book saved to your library`)}},N={render:T},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  render: renderTones
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  render: renderStates,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("button", {
      name: "retry"
    }));
    await expect(canvas.getByText("trying again…")).toBeVisible();
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  render: renderChips,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("button", {
      name: "remove hardcover filter"
    }));
    await expect(canvas.queryByText("hardcover")).not.toBeInTheDocument();
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  render: renderBanner,
  play: async ({
    canvas,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("button", {
      name: "dismiss update"
    }));
    await expect(canvas.queryByLabelText("site update")).not.toBeInTheDocument();
  }
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  render: renderToast,
  play: async ({
    canvas,
    canvasElement,
    userEvent
  }) => {
    await userEvent.click(canvas.getByRole("button", {
      name: "save book"
    }));
    const notification = canvasElement.ownerDocument.querySelector('[role="status"].toast');
    await expect(notification).toHaveTextContent("book saved to your library");
  }
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  render: renderBadges
}`,...N.parameters?.docs?.source}}},P=[`Tones`,`ApplicationStates`,`Chips`,`Banner`,`Toast`,`Badges`]})))()}F();export{k as ApplicationStates,N as Badges,j as Banner,A as Chips,M as Toast,O as Tones,P as __namedExportsOrder,D as default};